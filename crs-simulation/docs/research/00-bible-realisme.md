# 00 — Bible de réalisme (référence condensée pour tous les développeurs)

> Synthèse arbitrée des dossiers 01 à 06, relue et complétée le 16 novembre 2026. **En cas de désaccord entre deux dossiers, c'est ce fichier qui fait foi** ; le détail et les URL restent dans les dossiers 01 à 06.
> Vérifications faites pour cette bible sur documents primaires : code de la sécurité intérieure et code pénal consolidés (éditions du 14 novembre et du 20 octobre 2026), instruction commune du 27 juillet / 2 août 2017 sur les armes de force intermédiaire (annexes), instruction gendarmerie n° 200000 du 26 juillet 2022, dossier de presse « Le Centaure » (octobre 2023), Cour des comptes « Les forces mobiles » (2024), réponse ministérielle n° 12772 (engins lanceurs d'eau).
> Rappels du BRIEF : aucun nom de marque, de personne, de parti ni de syndicat réel dans le jeu ; violences décrites au niveau du gameplay ; interface en français.

**Marqueurs.** **(vérifié)** = valeur lue dans un texte officiel, un document primaire, une base de référence (open data Ville de Paris, IGN, OpenStreetMap) ou une source de référence lue et non contredite. **(estimé)** = valeur de conception pour le jeu, calcul, donnée de constructeur ou de presse non recoupée, observation. Un marqueur placé dans un en-tête de colonne ou de tableau vaut pour toutes ses valeurs. **Tous les codes hexadécimaux sont (estimé)** (seuls les RAL 7011 / 7012 des barrières de chantier sont officiels). Distances en mètres, durées en secondes, sauf mention.

---

## A. Sommations et cadre d'emploi de la force

### A.1 Textes exacts, à reproduire au caractère près (audio et sous-titres)

Article R. 211-11 du code de la sécurité intérieure, version du décret n° 2021-556 du 5 mai 2021, relu dans le code consolidé du 14 novembre 2026 **(vérifié)**. Le texte réglementaire ne met ni point ni point d'exclamation final.

| Clé | Étape (verbe du texte) | Paroles à prononcer « par haut-parleur » |
|---|---|---|
| `S1` | Annonce (« Annonce sa présence ») | « Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux » |
| `S2` | Première sommation | « Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux » |
| `S3` | Deuxième et dernière sommation | « Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux » |
| `S3bis` | Réitération avant l'usage des armes de l'article R. 211-16 | Répéter `S3` mot pour mot |

- Suite de l'article **(vérifié)** : « Si l'utilisation du haut-parleur est impossible ou manifestement inopérante, chaque annonce ou sommation peut être remplacée ou complétée par le lancement d'une fusée rouge. » — « Toutefois, si, pour disperser l'attroupement par la force, il doit être fait usage des armes mentionnées à l'article R. 211-16, la dernière sommation ou, le cas échéant, le lancement de fusée qui la remplace ou la complète doivent être réitérés. »
- Formules antérieures au 5 mai 2021, **à ne pas utiliser** : « Obéissance à la loi. Dispersez-vous » ; « Première sommation : on va faire usage de la force » ; « Dernière sommation : on va faire usage de la force ».
- Code pénal, art. 431-3 **(vérifié)** : « Constitue un attroupement tout rassemblement de personnes sur la voie publique ou dans un lieu public susceptible de troubler l'ordre public. »
- CSI, art. L. 211-9, al. 6 **(vérifié)** : « Toutefois, les représentants de la force publique appelés en vue de dissiper un attroupement peuvent faire directement usage de la force si des violences ou voies de fait sont exercées contre eux ou s'ils ne peuvent défendre autrement le terrain qu'ils occupent. »
- CSI, art. R. 211-13 **(vérifié)** : « La force déployée doit être proportionnée au trouble à faire cesser et son emploi doit prendre fin lorsque celui-ci a cessé. »
- Insigne, art. R. 211-12 **(vérifié)** : préfet, maire, officier de police judiciaire de la police ou de la gendarmerie portent tous « écharpe tricolore ou brassard tricolore ». **Aucun texte ne fixe le sens de port** pour le commissaire (voir D et J).
- Avertissements hors sommations (riposte directe), textes de jeu **(estimé)** : « Attention, nous allons employer des grenades lacrymogènes. Écartez-vous. » ; « Attention, charge. Dégagez la chaussée. » ; « Attention, usage du canon à eau. Reculez. »

### A.2 États juridiques (un état par unité et par compartiment de terrain)

| Code | État | Entrée | Force licite maximale (`RoeState.lawfulForce` ; le chiffre est une correspondance de jeu, estimé) | `sommation` |
|---|---|---|---|---|
| `E0` | Cortège ou rassemblement | État initial | 1 : présence, barrage statique, filtrage, dialogue | 0 |
| `E1` | Annonce faite | `S1` prononcée par l'autorité civile | 1 | 1 |
| `E2` | Première sommation faite | `S2` | 1 | 2 |
| `E3` | Emploi de la force autorisé | `S3` + délai A.5 + autorisation (moyens et limite) | 2 : refoulement, charge, bâton, lacrymogènes **à la main**, canon à eau | 3 |
| `E4` | Usage des armes autorisé | `S3bis` + ordre exprès tracé | 3 : lanceurs 56 et 40 mm, grenade assourdissante-lacrymogène, assourdissante, désencerclement | 3 (réitérée) |
| `R` | Riposte directe | Violences ou voies de fait contre l'unité, ou terrain indéfendable autrement | 4 : tous les moyens de dotation, **dont le LBD** | inchangé, `underAttack = true` |
| `LD` | Légitime défense, art. L. 435-1 | Atteinte à la vie ou à l'intégrité physique | 5 : arme de service | inchangé |
| `FIN` | Fin d'emploi de la force | Le trouble a cessé | retour à 1 | 0 |

### A.3 Règles applicables par le moteur

1. **Défaut.** Toute unité est en `E0`. Aucune action coercitive ; les unités restent hors de vue (rue parallèle) ou à 50 m au moins (estimé) du cortège, sauf en tête. Une manifestation est déclarée, jamais « autorisée » : un cortège calme n'est pas une cible (vérifié).
2. **Autorité.** Seul un personnage au poste `autorite_civile`, présent à moins de 50 m (estimé) de l'unité et portant l'insigne (`sash` ou `armband`), peut constater l'attroupement et prononcer `S1` à `S3bis`. Le commandant de CRS n'est jamais habilité. Sans autorité civile présente : seuls `R` et `LD` existent (vérifié : art. R. 211-21, instruction de 2022).
3. **Constat.** L'attroupement peut être constaté si la manifestation est interdite ou non déclarée, si elle ne respecte pas sa déclaration, si les organisateurs ont donné l'ordre de dispersion (vérifié), ou, règle de jeu, si 3 infractions distinctes au moins ont été vues en 60 s dans la zone (estimé). Qualifier d'attroupement un cortège calme est une faute.
4. **Ordre des phrases.** `S1` → `S2` → `S3`, sans saut ni inversion ; durées de diction 7 s, 5 s, 5 s (estimé). Phrases sans insigne porté : nulles.
5. **Haut-parleur et fusée rouge.** Mégaphone ou sonorisation de véhicule obligatoire ; fusée rouge en complément libre, **obligatoire en jeu** si moins de 50 % (estimé) de la foule visée est dans la portée intelligible (table B).
6. **Délais.** Table A.5. Une étape lancée avant le délai minimal est refusée par l'interface.
7. **Autorisation.** En `E3`, l'autorité civile fixe des **moyens** et une **limite géographique**, horodatés au journal (traçabilité exigée par l'art. R. 211-14, vérifié). `authorizedForce` ne dépasse jamais `lawfulForce`.
8. **Armes.** Les armes de l'art. D. 211-17 (grenades à effet sonore, à effet sonore et lacrymogène, lanceurs de 56 mm et de 40 mm et leurs munitions, grenades à main de désencerclement) exigent `E4` ou `R` (vérifié).
9. **LBD.** Jamais licite en `E3` ni en `E4` : uniquement `R`, `LD`, état de nécessité (vérifié : annexe VIII, art. D. 211-19).
10. **Riposte directe.** `R` s'ouvre si l'unité a reçu un projectile ou un coup dans les 10 dernières secondes dans un rayon de 40 m (estimé), ou si sa position est débordée ; le commandant de l'unité décide seul ; `R` se referme 30 s (estimé) après le dernier acte violent. Un avertissement (A.1) est demandé « chaque fois que cela est possible » (vérifié) : en jeu, il divise par 2 le coût en tension (estimé).
11. **Cessation.** Toute action coercitive plus de 20 s (estimé) après la dispersion (moins de 5 % de la foule visée encore dans la zone) est une faute « force poursuivie ».
12. **Compartiment de terrain.** Une série de sommations vaut pour une « séquence opérationnelle » (une mission, un temps, un compartiment de terrain : vérifié) ; en jeu, elle est à refaire après un changement de rue ou de place, ou un bond de plus de 150 m (estimé).
13. **Issue.** Sans issue libre de 6 m de large au moins (estimé), les personnes qui restent ne commettent pas le délit de l'art. 431-4 (jurisprudence citée au dossier 01) : interpellations nulles, tension en hausse.
14. **Lanceur de grenades.** Tir sur ordre hiérarchique uniquement ; « le tir tendu est strictement interdit » (vérifié) : angle minimal de 30° (estimé) ; binôme superviseur + lanceur (vérifié) ; interdit vers le conducteur d'un véhicule en mouvement et dans les locaux de faible capacité (vérifié).
15. **Désencerclement.** Lancée à la main, « au ras du sol », jamais au lanceur ; réservée à l'unité encerclée ou prise à partie (vérifié).
16. **Tir de LBD.** Cible = individu auteur de violences constatées depuis moins de 10 s (estimé) ; « le tireur vise de façon privilégiée le torse ainsi que les membres supérieurs ou inférieurs. La tête n'est pas visée » (vérifié) ; éviter les personnes manifestement vulnérables ; superviseur qui désigne l'objectif ; caméra ; compte rendu écrit ; vérification de l'état de santé (vérifié).
17. **Canon à eau.** Emploi de la force « après les sommations d'usage » (vérifié) : `E3`. Extinction d'un feu : toujours permise. Jet droit interdit à moins de 15 m et jamais à la tête (estimé).
18. **Bâton, bouclier, aérosol.** Aucun texte propre : nécessité et proportionnalité (art. R. 434-18). En jeu : `E3`, `R` ou `LD` ; frappe à la tête, sur une personne à terre, maîtrisée ou menottée = faute lourde (estimé).
19. **Arme de service.** Art. L. 435-1 : « absolue nécessité » et « manière strictement proportionnée » (vérifié). En jeu : `LD` uniquement ; enquête automatique après tout tir.
20. **Encerclement.** Seulement pour « prévenir ou faire cesser des violences graves et imminentes », avec un « point de sortie contrôlé », pendant une durée « strictement nécessaire », en informant régulièrement les encerclés (vérifié, dossier 01). Jeu (estimé) : sortie de 2 m tenue par 4 agents, annonce toutes les 60 s, réévaluation à confirmer toutes les 300 s, levée obligatoire à 1 200 s.
21. **Journalistes et observateurs.** Ils circulent dans le dispositif, peuvent rester pendant la dispersion s'ils ne sont pas confondus avec les participants et ne gênent pas ; ni entrave à la prise d'images ni saisie du matériel (vérifié, dossier 01). Toute force ou entrave contre eux = faute lourde.
22. **Identification.** Uniforme, numéro individuel à 7 chiffres visible, marquage d'unité dans le dos, cagoule proscrite (vérifié, dossier 01). Numéro masqué = faute.
23. **Ordre illégal.** Un ordre « manifestement illégal et de nature à compromettre gravement un intérêt public » doit être refusé ; l'exécuter n'exonère pas (art. R. 434-5, vérifié). Bouton « Faire part de mes objections ».
24. **Compte rendu.** Chaque tir est journalisé (heure, moyen, distance estimée, état juridique, ordre reçu, filmé ou non) ; l'écran de fin est le compte rendu d'opération : munitions par type, blessés des deux côtés, interpellations (vérifié pour le principe).

### A.4 Matrice de licéité (annexe VIII de l'instruction de 2017, vérifié ; lignes marquées * : classement de jeu, estimé)

| Moyen (`ForceMeans`) | `E0` à `E2` | `E3` | `E4` | `R` | `LD` |
|---|---|---|---|---|---|
| `presence` (barrage statique, filtrage) * | oui | oui | oui | oui | oui |
| `contact` (refoulement, bond offensif, charge, bouclier) * | non | oui | oui | oui | oui |
| `baton` * | non | oui | oui | oui | oui |
| `gazeuse` * | non | oui | oui | oui | oui |
| `lacrymo` lancée à la main | non | **oui, à la main uniquement** | oui | oui | oui |
| `canon_eau` (jet sur des personnes) | non | oui | oui | oui | oui |
| `lacrymo` au lanceur de 56 ou 40 mm | non | non | oui | oui | oui |
| `gm2l` et grenade assourdissante | non | non | oui | oui | oui |
| `desencerclement` | non | non | oui | oui | oui |
| `lbd` | non | **non** | **non** | oui | oui |
| `arme_feu` | non | non | non | non | oui (atteinte à la vie ou à l'intégrité) |
| `vehicule` (lame du Centaure sur un obstacle vérifié vide) * | oui | oui | oui | oui | oui |

### A.5 Délais (aucun délai chiffré n'existe dans les textes ; valeurs de jeu, estimé)

| Intervalle minimal | Courte (10 min) | Standard (25 min) | Longue (45 min) | Temps réel |
|---|---|---|---|---|
| `S1` → `S2` | 15 | 30 | 60 | 120 |
| `S2` → `S3` | 15 | 30 | 60 | 120 |
| `S3` → premier acte de force | 10 | 20 | 40 | 60 |
| `S3bis` → premier tir d'arme | 5 | 10 | 20 | 30 |
| Réponse de l'autorité à une demande | 5 à 20 (20 à 60 en « commandement centralisé ») | idem | idem | idem |

---

## B. Tableau du matériel

Condition légale : codes de A.2 (« `E3`+ » = `E3`, `E4`, `R`, `LD`). Quantité = dotation de jeu en durée standard.

| Objet (`ItemId`) | Porteur | Apparence | Dimensions, masse | Couleur | Portée | Durée d'effet | Rayon | Cadence | Quantité | Condition légale |
|---|---|---|---|---|---|---|---|---|---|---|
| Bouclier de maintien de l'ordre (`bouclier`) | Porte-bouclier | Polycarbonate transparent cintré, deux poignées ; se raye, se fissure | 1,00 × 0,57, ép. 0,004 ; 4 kg (estimé) | `#CFE3EA` à 25 % | contact | — | couvre 0,7 de front (estimé) | — | 1 | Protection : toujours ; coup de bouclier : `E3`+ |
| Petit bouclier rond | Interpellateur | Disque transparent, une poignée | Ø 0,58 ; 2,5 kg (estimé) | idem | contact | — | — | — | 1 | idem |
| Bâton de défense à poignée latérale (`tonfa`, `baton`) | Tout agent | Bâton noir, poignée perpendiculaire | 0,60 × Ø 0,03 ; 0,6 kg (estimé) | `#111111` | 1,2 (estimé) | — | — | 1 coup par 0,8 s (estimé) | 1 | `E3`+ ; jamais tête, personne à terre ou maîtrisée |
| Aérosol lacrymogène individuel (`gazeuse`) | Tout agent | Bombe à gâchette, étui de ceinture | Ø 0,04 × 0,15 ; 100 ml (estimé) | corps `#1A1A1A`, capot `#D62828` | 4, cône de 30° (estimé) | gêne 60 s (estimé) | — | 7 jets de 1 s (estimé) | 1 | `E3`+ ; jamais sur une personne maîtrisée |
| Aérosol grande capacité | 1 par groupe | Grosse bombe à poignée-pistolet | Ø 0,07 × 0,30 (estimé) | `#1A1A1A` | cône de 7 (estimé) | 60 s (estimé) | — | 12 s de jet cumulé (estimé) | 1 | `E3`+ |
| Grenade lacrymogène à 6 palets, à main (`grenade_lacrymo`) | Lanceur, chefs de groupe | Cylindre gris à cuillère | calibre 56 mm (vérifié) ; longueur 0,199 ; 340 g (estimé) | `#9AA0A6`, nuage `#E4E6E1` → `#C7CBC6` | 5 à 30 à la main (estimé) | émission 30 s par palet ; nuage 60 à 180 s sans vent (estimé) | 800 m², soit 16 de rayon, sur 3 à 5 de haut (estimé, fiche de fabricant de 2012) | lancer en 3 s (estimé) | 4 par lanceur, 2 par chef de groupe (estimé) | `E3`+ |
| Même grenade tirée au lanceur | Lanceur | Tir en cloche, s'ouvre en l'air, 6 palets dispersés sur 5 à 15 (estimé) | idem | idem | 50, 100 ou 200 selon le dispositif de propulsion (vérifié) ; vol 3,2 / 4,5 / 6,4 s (estimé) | idem | idem | voir lanceur | 8 par lanceur (estimé ; gilet réel : jusqu'à 20, presse) | `E4` ou `R` ; sur ordre ; tir tendu interdit |
| Lanceur de grenades 56 mm mono-tube (`lanceur_cougar` ; afficher « Lanceur 56 ») | Lanceur + superviseur | Gros tube noir, crosse repliable | 0,765 de long ; 3,67 kg (estimé) | `#15171A` | 50 à 200 (vérifié) | — | — | 6 à 8 coups par minute, soit 8 s par tir (estimé) | 2 par section (estimé) | `E4` ou `R` |
| Lanceur multi-coups 40 mm | Unités spécialisées | Barillet à 6 chambres (vérifié) | 0,87 ; 5,2 kg (estimé) | `#15171A` | 50, 100, 150 (estimé) | — | — | 6 coups en 6 s (estimé) | option | `E4` ou `R` |
| Grenade assourdissante-lacrymogène (`grenade_gm2l`) | Lanceur | Cylindre court | Ø 0,056 × 0,092 ; 150 g (estimé) | `#6B7280` | 200 au plus (vérifié) ; au lanceur et en cloche seulement depuis 2021 (vérifié) | détonation + nuage instantané 15 s (estimé) | sidération 10, nuage 5 (estimé) ; 160 dB à 5 m (estimé) | voir lanceur | 2 par lanceur (estimé) | `E4` ou `R` |
| Grenade assourdissante à main | Chef de groupe | Petit cylindre | non trouvé | `#3A3A3A` | 5 à 30 (estimé) | détonation | 8 (estimé) | 3 s | 1 par groupe ; option « suspendue en 2026 » (presse) | `E4` ou `R` |
| Grenade de désencerclement (`grenade_desencerclement`) | Chef de groupe, interpellateur | Cylindre noir à cuillère, roulée au sol | Ø 0,056 ; 248 g (estimé) | `#111111` | jusqu'à 30 (vérifié) | retard 1,5 s (vérifié) ; détonation de plus de 150 dB (estimé) | 10 au plus (vérifié), 18 galets de caoutchouc (vérifié) ; modèle actuel moins puissant : 7 en jeu (estimé) | 3 s | 2 par groupe (estimé) | `E4` ou `R` ; au ras du sol ; jamais au lanceur |
| Lanceur de balles de défense de 40 mm (`lbd40`) | 1 tireur habilité par section + superviseur | Lanceur mono-coup à canon basculant, viseur électronique | 0,59 de long ; 2,05 kg (estimé) | `#15171A` | 10 à 50, optimum 30 (vérifié) ; munition courte : 3 à 35, optimum 25 (vérifié) ; 92 m/s (estimé) | impact | — | 1 tir par 5 s (estimé) | 6 munitions (estimé) | `R` ou `LD` seulement ; torse et membres ; tête interdite |
| Arme de service (`pistolet`) | Tout policier | Pistolet semi-automatique en étui | 0,19 × 0,14 (estimé) | `#111111` | 25 (estimé) | — | — | — | 15 cartouches (estimé) | `LD` uniquement |
| Menottes, liens (`menottes`) | Tout agent | Acier ; liens plastiques | 0,24 × 0,08 (estimé) | `#B0B4BA` | contact | — | — | pose 4 s, liens 3 s (estimé) | 1 paire + 5 liens (estimé) | Personne dangereuse ou susceptible de fuir (art. 803 du code de procédure pénale, vérifié) |
| Radio (`radio`) | Tout agent | Poste portatif, micro d'épaule | 0,13 × 0,06 (estimé) | `#111111` | réseau | message 4 à 8 s (estimé) | — | 1 locuteur par canal | 1 | — |
| Mégaphone (`megaphone`) | Autorité civile, équipe de liaison | Porte-voix à pavillon | Ø 0,23 × 0,35 (estimé) | `#F2F2F2` | intelligible 60, audible 120 dans le bruit ; double par temps calme (estimé) | — | cône de 60° (estimé) | — | 1 | Obligatoire pour `S1` à `S3bis` |
| Haut-parleur de forte puissance | Véhicule sonorisé | Enceinte de toit | — | — | intelligible 150, audible 300 (estimé) | — | — | — | 1 par compagnie (estimé) | idem |
| Fusée rouge (`fusee_sommation`) | Autorité civile ou agent désigné | Étoile rouge tirée vers le ciel | — | `#FF2A1A` | apogée 80 (estimé) | visible 6 s (estimé) | visible de toute la place | 1 par étape | 4 (estimé) | Remplace ou complète chaque annonce ou sommation |
| Extincteur (`extincteur`) | Porte-extincteur, chaque véhicule | Extincteur portatif rouge | Ø 0,16 × 0,52 ; 6 kg (estimé) | `#D0021B` | 4 (estimé) | 15 s de jet (estimé) | — | — | 1, recharge au fourgon | Toujours |
| Masque à gaz (`masque_gaz`) | Tout agent | Masque panoramique, cartouche | 0,20 × 0,17 (estimé) | `#111111` | — | pose 8 s ; champ de vision −30 % (estimé) | — | — | 1 | — |
| Caméra-piéton | Chefs, superviseur du LBD | Boîtier sur le haut du torse, voyant rouge quand elle enregistre | 0,07 × 0,09 (estimé) | `#111111`, voyant `#FF2A2A` | 15 (estimé) | enregistrement non permanent, effacé après 1 mois (vérifié, art. L. 241-1) | — | — | 1 | Déclenchement quand un incident se produit ou risque de se produire |
| Écharpe ou brassard tricolore | Autorité civile | Voir D | largeur 0,11 (estimé) | `#0055A4` `#FFFFFF` `#EF4135`, franges `#C9CED6` | — | — | — | pose 1,5 s (estimé) | 1 | Obligatoire pour sommer (vérifié) |
| Barrière de police | Pose par la préfecture, les CRS | Acier galvanisé à barreaux, crochets | 1,10 × 2,00 ou 2,50 ; 14 à 20 kg (vérifié) | `#A9AEB3` | — | — | — | pose 5 s (estimé) | selon mission | — |
| Pavé, fragment (`pave`) | `radical`, `opportuniste` | Cube de granit ou débris ramassé | 0,10 de côté ; 1 à 3 kg (estimé) | `#6B6E72` | 15 à 30 (estimé) | impact | dispersion ± 3 à 20 m (estimé) | 1 jet par 6 à 10 s (estimé) | ramassé sur place (stock par rue) | Infraction : art. 222-14-5 si agent visé |
| Bouteille (`bouteille`) | idem | Verre | 0,5 kg (estimé) | `#6E8F7A` | 15 à 30 (estimé) | éclats 2 (estimé) | — | idem | ramassée (terrasses, conteneurs) | idem |
| Engin incendiaire (`molotov`) | `radical`, tension ≥ 0,7 | Bouteille enflammée | — | flamme `#FFD27A` / `#FF7A00` | 15 à 25 (estimé) | flaque de feu 20 à 40 s (estimé) | Ø 2 à 3 (estimé) | rare : 1 par 60 s et par bloc (estimé) | 0 à 6 par bloc (estimé) | art. 322-6 : 10 ans (vérifié) |
| Mortier d'artifice (`mortier`) | `radical`, émeutiers | Tube tenu à la main, tir tendu | 0,5 de long (estimé) | étoiles `#FF3B30` `#34C759` `#FFD60A` | 30 à 60 (estimé) | détonation, brûlure | sursaut 15 (estimé) | 1 coup par 1 à 2 s, 4 à 8 coups par tube (estimé) | 1 tube pour 15 radicaux (estimé) | Arme par destination |
| Fumigène (`fumigene`) | Cortège (couleur), bloc (noir = signal) | Torche | — | `#D62828`, signal `#1A1A1A` | — | 60 s (estimé) | 6 (estimé) | — | — | Interdit par arrêté aux abords |
| Banderole renforcée (`banderole`) | Tête du bloc, 6 à 10 porteurs | Bande rigide noire, lettres blanches | 3 à 6 × 1,5 (estimé) | `#0B0B0D` | — | arrête jets et tirs de LBD sur ses porteurs (estimé) | — | — | 1 à 3 par bloc | — |
| Parapluie (`parapluie`) | Bloc | Ouvert en nombre, masque aux caméras | Ø 1,1 (estimé) | `#0B0B0D` ; signal multicolore | — | masque 3 personnes au drone (estimé) | — | — | 1 pour 5 (estimé) | — |
| Marteau, barre (`marteau`, `barre`) | `radical`, `pilleur` | Outil | 0,3 à 0,8 (estimé) | `#3A3A3A` | contact | vitrine brisée en 2 à 6 coups, 3 à 10 s (estimé) | — | — | 1 pour 8 radicaux (estimé) | art. 322-1 |
| Bombe de peinture (`bombe_peinture`) | `radical` | Aérosol | — | `#101010`, `#B3121B` | 1 | inscription en 4 à 8 s (estimé) | — | — | — | art. 322-1 II |
| Pancarte, drapeau (`pancarte`, `drapeau`) | Manifestants | Carton manuscrit ; drapeau sur hampe | 0,5 × 0,7 ; hampe 2 à 3 (estimé) | selon la cause | — | — | — | — | 1 pour 4 marcheurs (estimé) | — |
| Sac de secouriste (`trousse_secours`, `serum_physiologique`) | Street medic, secouriste d'unité | Sac à dos, croix | — | `#F5F5F5`, croix `#D62828` | contact | rinçage 6 s ; pansement 10 s (estimé) | — | — | 20 doses de sérum (estimé) | — |
| Appareil photo, caméra (`appareil_photo`, `camera_tv`) | Journaliste | Boîtier et téléobjectif ; caméra d'épaule | — | `#111111` | sujet net de 5 à 30 (estimé) | publication après 30 à 120 s (estimé) | — | 1 vue par s | 24 vues (estimé) | Ne peut être saisi (vérifié) |

---

## C. Tableau des véhicules

| Véhicule (`VehicleKind`) | L × l × h | Masse | Vitesse | Équipage | Armement, équipement | Livrée | Sirène |
|---|---|---|---|---|---|---|---|
| Fourgon de CRS (`fourgon_crs`) | 5,8 × 2,05 × 2,55 (estimé) | 3,5 t (estimé) | 110 km/h ; 30 en colonne ; 5 derrière la troupe (estimé) | 6 : un groupe (vérifié) | Grilles rabattables, rampe bleue, haut-parleur, râtelier à boucliers, coffre à grenades, extincteur | Blanc `#F4F5F7`, « POLICE » et bandes `#1D4E9E` | Police |
| Car de transport (`car_crs`) | 12,0 × 2,55 × 3,30 (estimé) | 18 t (estimé) | 90 km/h (estimé) | 1 + 49 (estimé) | Soute à matériel | Blanc, « POLICE » | Police |
| Véhicule de commandement (`vl_commandement`) | 6,5 × 2,10 × 2,80 (estimé) | 3,5 t (estimé) | 110 km/h (estimé) | 4 (estimé) | Radios, carte tactique, retour vidéo du drone, antennes de 1,5, sonorisation | Blanc, « POLICE » | Police |
| Voiture de police (`voiture_police`) | 4,64 × 1,84 × 1,65 (estimé) | 1,6 t (estimé) | 150 km/h (estimé) | 4 | Rampe bleue | Gris métallisé `#8E949A`, sérigraphie bleue et rouge (presse) ; variante blanche | Police |
| Fourgon cellulaire (`fourgon_cellulaire`) | 6,0 × 2,05 × 2,60 (estimé) | 3,5 t (estimé) | 110 km/h (estimé) | 2 + 8 retenus (estimé) | Cellules, vitres occultées | Blanc, « POLICE » | Police |
| Moto de BRAV-M (`moto_bravm`) | 2,25 × 0,98 × 1,41 (estimé) | 260 kg (estimé) | 130 km/h ; 20 à moins de 30 m de piétons (estimé) | 2 : pilote + opérateur (vérifié) | Feux bleus, top-case ; aucun geste de force en selle | Sombre `#1A1A1A`, sans gros marquage | Police |
| Centaure (`centaure`) | 7,5 × 2,94 × 3,82 (vérifié) ; caisse à 3,0, le reste est le tourelleau (estimé) | 14,5 t (vérifié) | 100 km/h sur route (estimé) ; 6 km/h près des piétons (estimé) | 3 opérateurs + 7 passagers (vérifié) | 300 ch, blindage STANAG 2 ; lame : pousse 12 t immobilisées (« un bus à vide ») ou 31 t sur roues, percute 3,5 t jusqu'à 30 km/h (vérifié) ; lance-grenades téléopéré, « de 1 à 30 tirs en série » (vérifié), 0,3 s entre deux tirs, rechargement 120 s, une recharge de 30 (estimé) ; vision à 360°, vision de nuit de 3 à 9 km, détection de tirs (vérifié) ; sonorisation extérieure (vérifié pour les blindés polyvalents) ; mitrailleuse démontée en maintien de l'ordre | Bleu profond `#1B2F5E`, « GENDARMERIE » blanc | Gendarmerie |
| Engin lanceur d'eau (`canon_eau`) | 9,67 × 2,60 × 3,72 (estimé, constructeur) | 29 t (estimé) | 90 km/h (estimé) ; 5 derrière la ligne | 3 : conducteur, chef d'engin, opérateur (estimé) | 2 canons de toit ; cuve 10 000 l (estimé ; parc CRS officiel : 4 000 à 7 500 l, vérifié) ; 15 l/s (estimé) ; 15 à 20 bars (estimé) ; portée 60 au plus, 40 utile en jet droit, 15 à 20 en jet diffus (estimé) ; émulsifiant anti-incendie à 6 ou 7 % (vérifié) ; ravitaillement sur bouche d'incendie 90 s (estimé) | Blanc `#F4F5F7`, « POLICE », cabine grillagée | Police |
| Véhicule de groupe de gendarmerie | 6,0 × 2,05 × 2,60 (estimé) | 3,5 t (estimé) | 110 km/h (estimé) | jusqu'à 9 (vérifié) | Idem fourgon | Bleu `#23407A`, sérigraphie jaune (estimé) | Gendarmerie |
| Engin-pompe des sapeurs-pompiers (`camion_pompiers`) | 6,5 × 2,30 × 2,90 (estimé) | 14 t (estimé) | 90 km/h (estimé) | 6 (vérifié) | Lance (25 de portée, 8 l/s, estimé), échelle, couloir requis de 3,5 de large (estimé) | Rouge `#C8102E`, bande jaune, « SAPEURS-POMPIERS DE PARIS » | Pompiers |
| Ambulance (`ambulance`) | 6,0 × 2,10 × 2,80 (estimé) | 3,5 t (estimé) | 130 km/h (estimé) | 3 (vérifié) | Brancard, matériel de réanimation | Pompiers : rouge ; SAMU : blanc, « SAMU » `#003DA5`, chevrons jaune et rouge | Pompiers ou SAMU |
| Camion sono (`camion_sono`) | 7,0 × 2,3 × 3,2 (estimé) | 7,5 t (estimé) | au pas : 3 km/h (estimé) | 1 + animateur | Enceintes, groupe électrogène, ballon de Ø 3 à 6 de haut (estimé) | Blanc + couleurs de l'organisation fictive | — |
| Drone (`drone`) | 0,35 × 0,28 × 0,11 (estimé) | 0,9 kg (estimé) | 15 m/s ; altitude 30 à 120 (estimé) | Télépilote + opérateur image | Caméra zoom ×28 et thermique ; batterie 30 min, relève 40 s ; audible sous 80 (estimé) ; **ni son ni reconnaissance faciale, pas d'intérieur de domicile, images gardées 7 jours** (vérifié, art. L. 242-4 et L. 242-5) | Gris `#8A8F96` | — |
| Hélicoptère (`helicoptere`) | rotor Ø 10,2 ; h 3,5 (estimé) | 2,9 t (estimé) | 260 km/h ; orbites à 300 à 600 de haut (estimé) | 3 | Caméra, projecteur ; ne tire jamais | Bleu `#1F3A7A`, « GENDARMERIE » | — |
| Voiture, utilitaire, bus, scooter (civils) | 4,3 × 1,8 × 1,5 ; 5,0 × 2,0 × 2,2 ; 12 × 2,55 × 3,0 ; 1,9 × 0,7 × 1,2 (estimé) | 1,3 t ; 2 t ; 12 t ; 130 kg (estimé) | 50 km/h en ville | 1 à 5 ; 2 ; 1 + 80 ; 1 | Peuvent être renversés (voiture : 6 personnes, 8 s) et incendiés : embrasement 2 à 4 min, durée 15 à 25 min (estimé) | Noms de modèles fictifs | — |

**Sirènes deux tons (vérifié, arrêté de 1987 lu par deux sources secondaires concordantes).** Police : 435 Hz / 580 Hz, 50 à 60 cycles par minute. Gendarmerie : 435 / 732 Hz, 50 à 60. Pompiers : 435 / 488 Hz, **25 à 30** (lent). SAMU : 435 / 651 Hz, 50 à 60. Feux d'urgence : toujours bleus `#1E5BFF`, 2 à 4 éclats par seconde (estimé) ; orange = voirie.

---

## D. Apparence de chaque catégorie de personnage

Objectif : unité reconnaissable à 30 m, grade lisible à 5 m. Entre parenthèses : `OutfitId` et `HeadgearId` du contrat.

| Catégorie | Palette | Signes distinctifs |
|---|---|---|
| **CRS, socle commun à tous les grades** (`crs_mo`, `casque_crs`) | Tenue marine `#1A2238` ; protections `#15171A` ; casque `#0F1420` brillant ; bandes `#F5C400` ; écusson `#C8102E` ; lettres `#FFFFFF` | Casque sombre à **deux bandes jaunes horizontales** (vérifié), visière transparente, protège-nuque ; grand **écusson rouge « CRS »** (vérifié) ; épaulières, coudières, jambières portées sur la tenue ; gilet ; gants ; dos : « POLICE » + **code de groupe « 1A » à « 4C »** (vérifié) ; numéro individuel à 7 chiffres (vérifié), blanc sur bandeau noir `#111111`, sur la poitrine ; galons sur fourreaux d'épaule à **fond bleu clair `#8FA3BF` avec flambeau** (vérifié) |
| CRS, gardien stagiaire | galon argent `#C9CED6` | 1 chevron de 8 mm (vérifié) ; jamais au LBD (vérifié) |
| CRS, gardien de la paix | idem | 2 chevrons emboîtés, 18 mm (vérifié) ; 3 chevrons, 28 mm, à partir du 6e échelon ; postes : bouclier, lanceur, LBD, extincteur, interpellation, conducteur |
| CRS, brigadier-chef | argent + raie `#D0021B` | 1 barrette argent de 10 mm à raie rouge de 1 mm (vérifié) ; chef de groupe : radio, caméra-piéton ; lettre du groupe à l'arrière du casque (convention de jeu, estimé) |
| CRS, major | idem | Même barrette + liseré argent de 2 mm placé à 4 mm (vérifié) ; chef de section : pas de bouclier, deux radios |
| CRS, capitaine | blanc `#F4F4F4` | 2 barrettes blanches de 10 mm pendant les 4 premières années (appelé « lieutenant »), puis 3 barrettes de 8 mm (vérifié) ; chef de section ou adjoint |
| CRS, commandant | idem | 4 barrettes blanches de 7 mm, 3 serrées + 1 séparée de 4 mm (vérifié) ; ni bouclier ni lanceur ; mention « CDT » à l'arrière du casque (convention de jeu, estimé). **Aucune « bande de grade » sur le casque n'est documentée** |
| **Autorité civile** (`commissaire`) | Tenue de service marine ou costume sombre `#1F2430` ; écharpe `#0055A4` `#FFFFFF` `#EF4135`, franges `#C9CED6` | Seul personnage à insigne tricolore : **écharpe en bandoulière de l'épaule droite à la hanche gauche, bleu vers le col** (convention de jeu, estimé) ou **brassard tricolore** au bras gauche, 0,10 de haut (estimé) ; mégaphone ; deux radios ; casque sombre sans bandes ou tête nue ; galon : branche de 5 feuilles de chêne et 1 gland (vérifié) ; l'insigne n'est porté que pendant l'exercice |
| **Gendarme mobile** (`gendarme_mo`, `casque_gendarme`) | Casque `#2F55A4` ; tenue `#0E1220` ; insignes or `#C9A227` | Casque **entièrement bleu** (vérifié) avec grenade stylisée à l'avant ; galons **dorés** (vérifié) ; « GENDARMERIE » en blanc dans le dos ; mêmes protections ; bouclier rectangulaire transparent |
| Compagnie d'intervention parisienne (PNJ) | Casque sombre, bande `#2D6CDF` | Casque à bande bleue (estimé, d'après photos) ; « POLICE » ; galons argent sur fond bleu nuit |
| **BRAV-M** (`bravm`, `casque_moto`) | Noir `#0B0B0D` ; casque `#111111` | Tenue noire, protections lourdes, **casque de moto gardé à pied** (estimé) ; « POLICE » dans le dos ; toujours par deux ; bâton, aérosol, menottes |
| **Policier en civil** (`police_civil`) | Vêtements civils ; brassard `#FF6A00`, lettres noires | **Brassard « POLICE » obligatoire** (estimé) ; sans brassard, les PNJ et la presse le traitent en inconnu ; casque de moto possible |
| **Pompier** (`pompier`, `casque_pompier`) | Tenue `#1B2440`, bandes `#E6D200` ; casque `#C8CCD2` ; engins `#C8102E` | Casque chromé, veste à bandes rétroréfléchissantes, « SAPEURS-POMPIERS DE PARIS » dans le dos (estimé) ; lance, extincteur |
| **SAMU** (`samu`) | Blanc `#F4F4F4`, bleu `#003DA5`, fluo `#DFFF00` | Tenue blanche et bleue à bandes fluo, « SAMU » dans le dos, sac rouge, brancard (estimé) |
| **Street medic** (`street_medic`, `casque_medic`) | Blanc `#F5F5F5`, croix `#D62828` ou `#1D4E89` | Tee-shirt ou brassard à croix, casque de skate, masque, lunettes, sac à dos ; par équipes de 2 ou 3 (estimé) |
| **Journaliste** (`presse`, `casque_presse`) | Casque noir ou blanc ; brassard `#FFFFFF` | Casque et brassard « PRESSE », gilet, masque, appareil à téléobjectif ou caméra d'épaule ; **aucun signe n'est obligatoire** (vérifié) : un journaliste sans marquage existe |
| **Observateur** (`observateur`) | Chasuble `#F5F5F5`, casque `#2D6CDF` | Chasuble et casque siglés « OBSERVATEUR », par équipes de 3, carnet et téléphone (estimé) |
| Manifestant, gilets jaunes (`gilet_fluo`) | `#DFFF00`, bandes `#C8CCD0` | Gilet de haute visibilité annoté au dos, bonnet ; pancarte : « On veut vivre, pas survivre » |
| Manifestant, cortège syndical (`syndical`) | Chasubles `#D62828` `#F77F00` `#1D4E89` `#6A4C93` `#2A9D8F` `#F2C94C` | Chasuble d'une organisation fictive, drapeau de 1,0 × 1,5, ballon, camion sono ; « Retraites : ni report, ni recul » |
| Service d'ordre | Brassard `#C1121F` | Brassard « SO », chaîne humaine de 5 à 12 personnes autour du carré de tête ; ne lance jamais |
| Étudiants et lycéens | Jean `#3B5B8C`, sweat `#58C99B` | Sac à dos, carton peint, mégaphone ; « Notre avenir n'est pas à vendre » |
| Militants climat | `#3C8D4B`, `#F2C94C` | Vêtements colorés, globe en carton ; « Il n'y a pas de planète B » |
| Personnels soignants | Blouse `#F5F5F5`, `#A9CCE3` | Blouse blanche ; « Des lits, des bras, du temps pour soigner » |
| Agriculteurs | Cotte `#4B6B3C`, paille `#C8A24A` | Cotte, bottes, tracteur en tête ; « Sans paysans, pas de pain » |
| Retraités, familles | Tons `#B8A98A`, `#8A8D91` | Canne-siège, écharpe ; poussette, ballons, enfant sur les épaules ; « Pour l'école de nos enfants » |
| **Black bloc** (`black_bloc`, `capuche`) | `#0B0B0D`, `#1C1C1F` | Noir de la tête aux pieds, capuche, visage masqué, lunettes, gants, sac à dos ; banderole renforcée en tête, parapluies ; **se change en 30 à 60 s à couvert** (estimé) et redevient visuellement un manifestant ordinaire |
| Pilleur ; passant, touriste, commerçant (`civil`) | Sombre `#1C1C1F` ; palette neutre | Capuche, sac vide puis butin ; sacs de courses, téléphone levé ; tablier, rideau métallique |

---

## E. Organisation et commandement

### E.1 Unités

| Unité | Réel | Valeur de jeu retenue |
|---|---|---|
| Compagnie de CRS | 60 compagnies, 11 150 agents (vérifié) ; environ 130 agents par compagnie (estimé) ; commandée par un commandant de police ; 4 sections de service général + 1 section de commandement et de services ; 2 demi-compagnies « Alpha » et « Bravo » | **70 à pied** = commandement 6 (commandant, adjoint, 2 radios, opérateur vidéo, conducteur) + 4 sections de 16 ; 12 fourgons + 1 véhicule de commandement (estimé) |
| Section | **16 agents** (vérifié, Cour des comptes) ; 3 groupes A, B, C, le C étant le commandement (estimé) | 16 = A 6 + B 6 + C 4 |
| Groupe tactique | **6 agents** (vérifié) | 6 ; un fourgon par groupe |
| Seuil d'emploi | Jamais moins de 2 sections, soit **32 agents**, pour une mission de maintien de l'ordre (vérifié) | Demi-compagnie = 32 : plus petite unité qu'un scénario peut engager seule face à une foule |
| Escadron de gendarmerie mobile | 116 escadrons (vérifié) ; **72 militaires** engagés, 55 au minimum (vérifié) ; pelotons de 16 (vérifié) dont un peloton d'intervention | 72 = commandement 8 + 4 pelotons de 16 |
| Compagnie d'intervention parisienne | 120 agents sur le terrain (vérifié) | 2 × 60, PNJ |
| BRAV-M | Binômes pilote + opérateur ; sur le terrain sous l'autorité d'un commissaire (vérifié) ; taille d'une unité non trouvée | 18 motos, 36 agents, 3 groupes de 6 motos ; 1 pilote sur 3 garde les machines (estimé) |
| Appuis | Engin lanceur d'eau : décision du préfet de zone (vérifié) ; blindé : décision gouvernementale (vérifié) | Appuis fixés par le scénario ; indisponibles sinon |

### E.2 Postes d'une section de 16 (construction de jeu, estimé)

| Groupe | Effectif | Postes (`PolicePoste`) |
|---|---|---|
| A, appui | 6 | chef de groupe et superviseur, 3 boucliers, 1 lanceur de grenades, 1 extincteur |
| B, intervention | 6 | chef de groupe et superviseur, 2 boucliers, 1 LBD, 2 interpellateurs à petit bouclier |
| C, commandement | 4 | chef de section, radio, secouriste-vidéo, lanceur de réserve |

Front tenu (estimé) : 0,7 m par bouclier au coude à coude, 1,0 m en ligne lâche. Section : 7 boucliers, soit 4,9 m ou 7 m. Compagnie : **20 m serrés, 28 m lâches** ; au-delà, fourgons en travers (5,8 m chacun) et barrières.

### E.3 Grades, postes et étendue du commandement

| Grade (`PoliceRank`) | Poste type | Commande | Carte tactique |
|---|---|---|---|
| `gardien_stagiaire`, `gardien` | équipier | personne | lecture seule |
| `brigadier` | grade supprimé le 1er août 2023 (vérifié) : option « avant 2023 » | — | — |
| `brigadier_chef` | chef de groupe | 6 agents | ordres à son groupe |
| `major` | chef de section | 16 agents | ordres à sa section |
| `capitaine` | chef de section ou adjoint : demi-compagnie | 32 agents | ordres à sa demi-compagnie |
| `commandant` | commandant de compagnie, « commandant de la force publique » | 70 agents + appuis affectés | toutes ses unités ; niveau de force plafonné par l'autorité civile |
| `commissaire` | autorité civile, chef de secteur | ne commande pas la manœuvre : qualifie, somme, autorise, suspend | calque juridique : état, issues, couverture sonore |

### E.4 Qui décide (vérifié : art. R. 211-14 et R. 211-21, schéma national, instruction de 2022)

| Décision | Autorité civile | Commandant de compagnie |
|---|---|---|
| Qualifier l'attroupement, faire les sommations | oui (ou officier de police judiciaire qu'elle désigne, elle présente) | non |
| Autoriser la force, puis les armes ; fixer moyens et limite | oui, ordre tracé | non : il propose et conseille |
| Choisir la manœuvre, l'articulation, le rythme | non | oui |
| Riposter à des violences contre l'unité | informée | oui, d'initiative |
| Suspendre ou annuler | oui, à tout moment | exécute et rend compte |

Chaîne parisienne : préfet de police → directeur du service d'ordre (salle de commandement) → chef de secteur (commissaire) → commandant d'unité → chef de section → chef de groupe.

### E.5 Indicatifs (tous fictifs ; les indicatifs réels n'ont pas été trouvés)

Salle : « CENTRAL ». Autorité civile du secteur n : « AUTORITÉ n ». Compagnies de CRS (noms de vents) : « MISTRAL », « TRAMONTANE », « SIROCCO », « ZÉPHYR » ; section n : « MISTRAL n » ; groupe : « MISTRAL n ALFA / BRAVO / CHARLIE ». Escadron : « ÉPERVIER », pelotons « ÉPERVIER 1 » à « 4 ». BRAV-M : « FAUCON 1 » à « 3 ». Engin lanceur d'eau : « NEPTUNE 1 ». Blindé : « CENTAURE 1 ». Drone : « ICARE ». Équipe de liaison : « LIAISON ». Secours : « SANTÉ 1 ».

### E.6 Phraséologie (procédure radiotéléphonique française courante, source de formation non officielle : estimé)

- Gabarit : `APPELÉ ICI APPELANT. Corps du message. PARLEZ` (réponse attendue) ou `TERMINÉ` (aucune réponse attendue).
- Mots : « REÇU » (j'accuse réception), « APERÇU » (compris et en mesure d'exécuter), « FAITES L'APERÇU », « COLLATIONNEZ » (répétez tout), « RÉPÉTEZ », « ATTENDEZ », « NÉGATIF », « URGENT ».
- Chiffres dits un par un, sauf les multiples exacts de mille : 45 → « QUATRE-CINQ » ; 5 000 → « CINQ MILLE ». Lettres en alphabet radio (ALFA, BRAVO, CHARLIE…).
- Compte rendu de situation : **nature, volume, attitude**. Alternat : un seul locuteur par canal ; appuyer, attendre 1 s, parler ; message de 4 à 8 s.
- Toute autorisation reçue est horodatée au journal : c'est la pièce relue en cas d'enquête.

### E.7 Quarante messages prêts à l'emploi (textes de jeu, estimé)

1. « CENTRAL ICI MISTRAL, CONTRÔLE RADIO, PARLEZ. » — « ICI CENTRAL, FORT ET CLAIR, TERMINÉ. »
2. « CENTRAL ICI MISTRAL. Compagnie en zone de stationnement, cours la Reine. SEPT-ZÉRO à pied, UN-DEUX fourgons. Prêt. PARLEZ. »
3. « MISTRAL ICI CENTRAL. Mission : INTERDIRE le pont de la Concorde. Cadre : manifestation interdite. AUTORITÉ DEUX est à vos côtés. FAITES L'APERÇU. » — « ICI MISTRAL. APERÇU. TERMINÉ. »
4. « CENTRAL ICI MISTRAL. Barrage d'interdiction en place, face nord : deux sections en ligne, deux en réserve, véhicules en travers à TROIS-ZÉRO mètres. PARLEZ. »
5. « MISTRAL UN ICI MISTRAL. Tenez l'angle de la rue de Rivoli, face est. Riposte directe seulement. PARLEZ. » — « ICI MISTRAL UN. REÇU, je tiens l'angle. TERMINÉ. »
6. « CENTRAL ICI MISTRAL UN. Tête de cortège à DEUX-ZÉRO-ZÉRO mètres. Nature : cortège déclaré. Volume : TROIS MILLE. Attitude : calme, service d'ordre présent. PARLEZ. »
7. « CENTRAL ICI ICARE. Nébuleuse de tête : QUATRE-ZÉRO-ZÉRO personnes devant la banderole, visages qui se couvrent. PARLEZ. »
8. « CENTRAL ICI ICARE. Fumigène noir, parapluies ouverts, changements de tenue : un bloc se forme à hauteur du kiosque. PARLEZ. »
9. « CENTRAL ICI MISTRAL TROIS. Chaussée dépavée à l'angle du boulevard du Temple, barrières de chantier tirées en travers. PARLEZ. »
10. « CENTRAL ICI LIAISON. Les organisateurs annoncent la dispersion dans UN-ZÉRO minutes, sortie par la rue de Lyon. PARLEZ. »
11. « CENTRAL ICI ICARE. Densité critique devant le barrage, plus de QUATRE personnes au mètre carré, aucune issue ouverte. PARLEZ. »
12. « AUTORITÉ DEUX ICI MISTRAL. Jets de projectiles sur le barrage, dégradations en cours, refus de reculer. Je propose un refoulement jusqu'à la rue de la Paix. Demande sommations et emploi de la force. PARLEZ. »
13. « ICI AUTORITÉ DEUX. NÉGATIF. Cortège pacifique, pas d'attroupement. Maintenez la distance. TERMINÉ. »
14. « MISTRAL ICI AUTORITÉ DEUX. Je constate l'attroupement et je procède à l'annonce. Aucun emploi de la force avant mon ordre. TERMINÉ. »
15. « CENTRAL ICI AUTORITÉ DEUX. Première sommation faite à UNE-SEPT heures ZÉRO-QUATRE. Issue ouverte : rue Saint-Antoine. TERMINÉ. »
16. « MISTRAL ICI AUTORITÉ DEUX. Dernière sommation faite. Emploi de la force autorisé : refoulement, lacrymogènes à main. Limite : rue de la Paix. FAITES L'APERÇU. » — « ICI MISTRAL. APERÇU. TERMINÉ. »
17. « MISTRAL ICI AUTORITÉ DEUX. Refoulement sans effet. Je réitère la dernière sommation. Usage des armes autorisé : lanceurs, tir courbe, CENT mètres. COLLATIONNEZ. » — « ICI MISTRAL. Je collationne : usage des armes autorisé, lanceurs, tir courbe, CENT mètres. TERMINÉ. »
18. « MISTRAL ICI AUTORITÉ DEUX. Halte à l'emploi de la force : le trouble a cessé. TERMINÉ. »
19. « CENTRAL ICI MISTRAL. Violences sur l'unité : mortiers et engins incendiaires. J'emploie la force d'initiative, cadre violences et voies de fait. Avertissement fait à la foule. PARLEZ. »
20. « CENTRAL ICI MISTRAL. Ordre reçu de charger un cortège assis et calme. Je fais part de mes objections et je demande la confirmation de l'autorité. PARLEZ. »
21. « MISTRAL DEUX ICI MISTRAL. Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ. »
22. « MISTRAL DEUX ICI MISTRAL. Chargez jusqu'à la rue Royale, arrêt au sifflet. PARLEZ. »
23. « MISTRAL UN À QUATRE ICI MISTRAL. Refoulement, axe boulevard, limite place de la République, par bonds de CINQ-ZÉRO mètres. Issue libre devant la foule. TERMINÉ. »
24. « MISTRAL TROIS ICI MISTRAL. Canalisez : débouchés latéraux fermés, parcours libre. PARLEZ. »
25. « MISTRAL ICI CENTRAL. Ouvrez la rue de Turbigo au cortège : parcours de délestage. PARLEZ. »
26. « MISTRAL UN ICI MISTRAL. Bouclage de l'îlot, sortie contrôlée rue Cambon, annonce aux personnes retenues toutes les minutes. PARLEZ. »
27. « MISTRAL TROIS ICI MISTRAL. Relevez MISTRAL UN sur place, passage de ligne. PARLEZ. »
28. « MISTRAL UN À QUATRE ICI MISTRAL. Rompez le contact, repli par échelons sur la ligne des véhicules. TERMINÉ. »
29. « MISTRAL QUATRE ICI MISTRAL. Embarquez, rejoignez le point BRAVO par le quai, débarquez à CINQ-ZÉRO mètres de la foule. PARLEZ. »
30. « MISTRAL TROIS ICI MISTRAL. Lacrymogènes à main sur le carrefour. Lanceurs : CENT mètres, tir courbe, sur mon ordre. PARLEZ. »
31. « MISTRAL ICI MISTRAL TROIS. Vent de face, retour de gaz sur la ligne. Je suspends les tirs et je fais mettre les masques. PARLEZ. »
32. « MISTRAL ICI MISTRAL QUATRE BRAVO. UN tir de lanceur de balles de défense, cadre riposte, objectif désigné, DEUX-CINQ mètres, impact à la jambe. Individu interpellé, état de santé vérifié. PARLEZ. »
33. « NEPTUNE UN ICI MISTRAL. Éteignez la barricade en feu, puis jet diffus devant la ligne, sur mon ordre. PARLEZ. » — « ICI NEPTUNE UN. REÇU. Reste QUATRE MILLE litres. TERMINÉ. »
34. « CENTAURE UN ICI ÉPERVIER. Vérifiez l'obstacle, puis dégagez la barricade. Salve de SIX, zone carrefour, tir courbe. FAITES L'APERÇU. » — « ICI CENTAURE UN. Obstacle vérifié, personne derrière. APERÇU. TERMINÉ. »
35. « FAUCON DEUX ICI CENTRAL. Groupe de UN-CINQ individus, vitrines brisées, rue Saint-Honoré. Objectif désigné par ICARE. Interpellez sur fait constaté. PARLEZ. »
36. « CENTRAL ICI MISTRAL QUATRE BRAVO. UN interpellé pour jet de projectile sur agents, heure UNE-SIX heures QUATRE-DEUX, fait filmé. Conduit au point de regroupement pour remise à l'officier de police judiciaire. PARLEZ. »
37. « CENTRAL ICI MISTRAL DEUX. URGENT. UN manifestant blessé à la tête, conscient, angle rue Royale. Demande SANTÉ sur place, je sécurise. PARLEZ. »
38. « MISTRAL UN ICI MISTRAL. Couloir pour SANTÉ UN, axe véhicules, largeur TROIS mètres CINQ-ZÉRO. TERMINÉ. »
39. « CENTRAL ICI MISTRAL UN. DEUX journalistes identifiés demandent à passer derrière le cordon. Je les laisse passer. TERMINÉ. »
40. « CENTRAL ICI MISTRAL. Dispersion effective, chaussée libre. Fin d'emploi de la force à UNE-SEPT heures ZÉRO-CINQ. Consommation : UN-DEUX lacrymogènes à main, SIX au lanceur, aucun tir de lanceur de balles de défense. UN agent blessé léger, DEUX interpellés. PARLEZ. »

Commandements à la voix dans la section (estimé) : « Section, en ligne ! » ; « Boucliers ! » ; « En avant, marche ! » ; « Halte ! » ; « Porte ! » ; « Lanceurs, cent mètres, tir courbe, feu ! » ; « Halte au feu ! » ; « Couloir ! » ; « Reformez ! ». Fin de charge : coup de sifflet ; dépasser le sifflet de plus de 2 s est une faute (estimé).

---
