# 02 — Matériel, tenues, véhicules et esthétique visuelle

> Dossier documentaire pour la modélisation 3D procédurale (Three.js) et le réglage du gameplay.
> Recherche web effectuée le 15 novembre 2026 (≈ 60 requêtes et lectures de pages ; sources primaires privilégiées).
> Ce fichier ne contient **aucune recette** : il décrit des apparences, des dimensions et des effets observables.

## 0. Mode d'emploi

### 0.1 Légende de fiabilité (à lire avant d'utiliser un chiffre)

| Marque | Signification |
|---|---|
| **[V]** | **Vérifié** : valeur lue dans une source primaire ou de référence, citée par son numéro `[S..]` (URL en section 9). |
| **[P]** | **Partiel** : source secondaire, commerciale, militante, ancienne, ou connue seulement par un résumé de moteur de recherche. Utilisable, mais à recouper. |
| **[E]** | **Estimation de modélisation** : valeur proposée par le documentaliste pour que les développeurs aient un nombre ; **non sourcée**. Cohérente avec les photos publiques, mais à ajuster à l'œil. |
| **[NT]** | **Non trouvé** : aucune source exploitable. Une valeur [E] est alors proposée à côté. |

Règle générale : **toutes les couleurs hexadécimales sont des [E]** (aucune source officielle ne publie de code couleur, sauf les RAL des barrières de chantier). Toutes les dimensions sont en **mètres** sauf mention contraire, les durées en **secondes**.

### 0.2 Marques et noms réels → noms à utiliser dans le jeu

Le BRIEF interdit toute marque commerciale. Les noms réels ci-dessous ne servent qu'à la traçabilité des sources.

| Objet | Nom réel rencontré dans les sources | Nom à afficher dans le jeu (proposition) |
|---|---|---|
| Lanceur de grenades 56 mm mono-tube | « Cougar » (et version compacte « Chouka ») [S5][S6] | « Lanceur 56 » ou « LG 56 » (le BRIEF cite « Cougar » : à arbitrer, c'est un nom de modèle commercial) |
| Lanceur de balles de défense 40 mm | « LBD 40 » (désignation administrative, pas une marque) [S1] | « LBD 40 » (conservé) |
| Lanceur multi-coups 40 mm | modèles à barillet 6 coups [S1][S5] | « Lanceur multi-coups 40 » |
| Grenades | CM6, MP7, GM2L, GMD, GENL, ASSD (désignations de modèles) [S1][S2] | « Lacrymogène 6 palets », « Lacrymogène 7 palets », « Assourdissante-lacrymogène », « Désencerclement », « Assourdissante » |
| Blindé de la gendarmerie | « Centaure » (nom de baptême officiel) [S3] | « Centaure » (conservé, nom institutionnel) ; constructeur jamais cité |
| Fourgons, cars, motos, voitures | modèles de constructeurs [S9][S46] | noms fictifs (« Fourgon T6 », « Car Régent », « Trail 1200 »…) |
| Caméra-piéton, viseur, radio | modèles de fabricants [S8][S49] | « Caméra-piéton », « viseur holographique », « poste radio » |
| Mobilier urbain | colonne Morris, fontaine Wallace, entrée Guimard | noms conservés (noms communs du patrimoine parisien) |

---

## 1. Tenues et silhouettes des forces de l'ordre

### 1.1 Le CRS en tenue de maintien de l'ordre (MO)

Ce qui est établi par les sources : les CRS portent casque, gilet pare-balles, protections des bras et des jambes, gants, bouclier anti-émeute et bâton de défense [S9] ; la dotation standard comprend aujourd'hui des **gilets pare-balles ignifugés**, des **manchettes de protection des avant-bras** et des **boucliers de maintien de l'ordre** [S2] ; **les bandes jaunes sur le casque et l'écusson sur l'uniforme sont apparus après 1968 pour différencier les CRS des autres forces** [S9][S54] ; ils portent un **grand écusson rouge « CRS »** [S10] ; les galons sont portés sur fourreaux d'épaule, **sur fond bleu clair / bleu-gris avec un flambeau** pour les CRS [S39].

| Élément | Apparence détaillée | Dimensions | Couleur (hex [E]) | Fiabilité |
|---|---|---|---|---|
| Combinaison / tenue MO | Veste et pantalon d'intervention bleu marine très sombre, tissu mat ignifugé, bas de pantalon rentré dans les rangers. Polo ou tee-shirt marine en dessous. | — | marine `#1A2238`, ombre `#10151F` | tenue bleue [V S10] ; détails [E] |
| Casque MO | Coque brillante sombre, **deux bandes jaunes horizontales** faisant le tour de la calotte, insigne métallique frontal, visière transparente relevable, **bavolet** (protège-nuque) sombre, jugulaire avec mentonnière. | coque ≈ 0,26 L × 0,22 l × 0,24 h ; bandes ≈ 0,018 de haut, espacées ≈ 0,02 ; visière ≈ 0,18 de haut, 3–4 mm ; bavolet ≈ 0,13 | coque `#0F1420` (bleu nuit quasi noir) ; bandes `#F5C400` ; bavolet `#0B0B0D` ; visière transparente (teinte `#DCE8F0`, opacité 0,15) | bandes jaunes [V S9][S10][S54] ; couleur de coque : « noir » selon une source anglophone [P], sinon [E] ; masse ≈ 1,75 kg pour un casque MO du commerce avec visière et bavolet [P] ; cotes [E] |
| Épaulières / protège-bras | Coques rigides noires articulées de l'épaule au coude, portées **sur** la veste. | épaulière ≈ 0,20 × 0,18 | `#15171A` mat | existence [V S9] ; cotes [E] |
| Coudières + manchettes | Coques de coude et gouttières d'avant-bras. | manchette ≈ 0,25 de long | `#15171A` | manchettes [V S2] |
| Jambières | Coque tibia + genouillère articulée, sangles arrière. | ≈ 0,55 de haut | `#15171A` | [V S9] ; cotes [E] |
| Coquille | Protection pelvienne portée sous le pantalon (invisible) ou sur ceinture. | — | — | [P] (citée dans la presse) |
| Gilet | Gilet pare-balles ignifugé + gilet tactique porte-équipements ; le grenadier porte un gilet pouvant emporter « une dotation de 20 grenades complètes ». | épaisseur visuelle ≈ 0,04 ; poches grenades ≈ 0,07 × 0,12 | `#12161F` | ignifugé [V S2] ; 20 grenades [V S43] |
| Gants | Gants d'intervention à renforts de phalanges. | — | `#0B0B0D` | [V S9] |
| Chaussures | Rangers / bottes d'intervention montantes noires. | tige ≈ 0,25 | `#0B0B0D` | [E] |
| Ceinturon | Étui d'arme de poing (cuisse ou hanche), porte-menottes, porte-aérosol, porte-bâton. | — | `#0B0B0D` | [E] |
| Masque à gaz | Porté en sacoche à la cuisse/hanche, mis sous le casque quand le nuage arrive. | sacoche ≈ 0,25 × 0,18 × 0,10 | sacoche `#1A2238` | [E] |
| Poids total de l'équipement | — | — | — | **[NT]** (aucun chiffre officiel trouvé ; la Cour des comptes parle seulement d'« alourdissement » [S2]) |

### 1.2 Marquages et identification du CRS

| Marquage | Texte / forme exacts | Emplacement | Fiabilité |
|---|---|---|---|
| Écusson d'unité | Grand écusson **rouge** portant « CRS » (insigne historique : flambeau entouré de feuilles de chêne et de laurier, devise « Servir ») | manche / poitrine | écusson rouge [V S10] ; insigne et devise [V S9] ; emplacement [E] |
| Mot dorsal | « POLICE » en capitales blanches (les sources ne décrivent pas le bandeau dorsal) | haut du dos du gilet | **[NT]** → [E] : lettres blanches `#FFFFFF`, hauteur ≈ 0,08, sur fond marine |
| Code tactique | Lettres et chiffres désignant **section + groupe tactique** : groupes « A », « B », « C » ; exemple cité : **« 1C »** = groupe de commandement de la 1re section | casque et/ou dos | principe et exemple [V S9] ; emplacement [E] (arrière du casque et dos) |
| Numéro de compagnie | Les compagnies sont désignées « CRS 8 », « CRS 21 », etc. | écusson / véhicules | désignation [V S9][S2] ; affichage sur la tenue **[NT]** → [E] : petit rectangle « CRS 21 » sous le mot dorsal |
| RIO (identification individuelle) | **Numéro à sept chiffres** sur une bande blanche | **poitrine** pour les policiers (épaule gauche, sur scratch, pour les gendarmes) | [P S50] (résumé des textes officiels) |
| Galons de grade | Sur **fourreaux d'épaule** ; blancs pour les officiers, argent pour les non-officiers ; fond **bleu clair / bleu-gris avec flambeau** chez les CRS (bleu nuit ailleurs) | épaules (et barrette de poitrine sur le gilet [E]) | [V S39] |

### 1.3 Grades : ce qui est vérifié, et la convention proposée pour le jeu

Vérifié [S39][S9] : la composition type d'une compagnie est 1 commandant, 1 capitaine, 2 lieutenants, 1 à 4 majors, 10 à 20 brigadiers-chefs, 100 à 150 gardiens de la paix ; le grade de **brigadier a été supprimé le 1er août 2023** (les gardiens accèdent directement à brigadier-chef) ; les insignes sont fixés par l'arrêté du 9 décembre 2019. **Le dessin exact de chaque galon (nombre de chevrons / barrettes) n'a pas été trouvé sous forme textuelle : [NT]. Aucune source ne décrit de « bandes de grade » sur le casque CRS : [NT].**

Convention **de jeu** proposée (lisible à 30 m, à présenter comme une simplification, pas comme la réalité) :

| Grade jouable | Rôle en jeu | Galon d'épaule (convention [E]) | Marque casque (convention [E]) |
|---|---|---|---|
| Gardien de la paix | équipier | 2 chevrons argent `#C9CED6` sur fond `#8FA3BF` | 2 bandes jaunes seules |
| Brigadier-chef | chef de groupe tactique (6) | 3 chevrons argent | + lettre de groupe (A/B/C) blanche à l'arrière |
| Major | adjoint de section | 1 barrette argent large | + chiffre de section |
| Lieutenant | chef de section (16) | 2 barrettes blanches `#FFFFFF` | + liseré blanc fin sous les bandes jaunes |
| Capitaine | adjoint au commandant | 3 barrettes blanches | idem |
| Commandant | commandant de compagnie | 4 barrettes blanches | idem + « CDT » à l'arrière |
| Commissaire (autorité civile) | décide l'emploi de la force | feuilles de chêne argent [E] | pas de casque CRS ; écharpe tricolore |

### 1.4 Reconnaître les unités d'un coup d'œil (tableau comparatif)

| Silhouette | Casque | Tenue | Marquages | Insignes | Fiabilité |
|---|---|---|---|---|---|
| **CRS** | sombre brillant, **2 bandes jaunes** | bleu marine | « POLICE » ; écusson rouge « CRS » ; code « 1C » | argent / blanc sur fond bleu clair | bandes, écusson, tenue bleue [V S9][S10][S39] |
| **Gendarme mobile** | **entièrement bleu** (bleu moyen), grenade stylisée à l'avant, visière | tenue sombre (décrite « noire » par une source anglophone ; historiquement bleu foncé / bleu gendarme) | « GENDARMERIE » ; RIO à l'épaule gauche | **or** (les insignes sont de couleur or dans la gendarmerie mobile) | casque bleu [V S11][S12] ; grenade [P S10] ; or [V S12] ; tenue noire [P S10] |
| **Compagnie d'intervention (préfecture de police)** | sombre, **sans bandes jaunes** ; les sources ne décrivent pas de marque propre | bleu marine | « POLICE » | argent sur fond bleu nuit [V S39] | absence de bandes : déduit de [S9] ; reste **[NT]** → [E] bandes bleues `#2D6CDF` pour la lisibilité en jeu |
| **BRAV-M** | **casque de moto gardé sur la tête** à pied | **tenue noire**, protections corporelles lourdes | « POLICE » | — | binôme à moto [V S2][S21] ; tenue noire + casque gardé [P S22b] |
| **Policier en civil** | aucun ou casque de moto/skate | vêtements civils | **brassard** obligatoire | brassard « POLICE » | port d'un brassard [P] (rappel IGPN, résumé de recherche) ; couleur orange fluo `#FF6A00`, lettres noires : [E] |
| **Commissaire / autorité civile** | souvent tête nue ou casque sombre | uniforme marine ou costume civil | **écharpe tricolore ou brassard tricolore** | glands et franges **argent** | [V S38][S23][S23b] |

Gendarme mobile, détail utile pour la 3D : protections « gants, jambières, manchettes, protections épaules-bras », bouclier transparent (rond puis ovoïde historiquement, rectangulaire aujourd'hui) [S12][S53] ; hex [E] : casque `#2F55A4`, tenue `#0E1220`, lettres `#FFFFFF`, insignes `#C9A227`.

### 1.5 L'autorité civile : écharpe et textes exacts des sommations

- **Qui** : à Paris, le préfet de police ou tout officier de police judiciaire responsable de la sécurité publique ; en pratique un commissaire [S23]. Depuis le décret n° 2021-556 du 5 mai 2021, le **brassard tricolore** peut remplacer l'écharpe, qui reste utilisable [S23b].
- **Écharpe** : bleu, blanc, rouge ; **glands et franges d'argent** pour les officiers de police judiciaire de la police nationale (or pour les maires) [S38]. Largeur **[NT]** → [E] 0,11 ; hex [E] bleu `#0055A4`, blanc `#FFFFFF`, rouge `#EF4135`, franges `#C9CED6`. Port : le texte de référence évoque le port « en ceinture » pour préfets et OPJ [S38] ; les photos de manifestations montrent surtout un port en bandoulière (épaule droite vers hanche gauche) : [E], à trancher visuellement.
- **Moyen sonore** : « Les sommations doivent être énoncées par haut-parleur. Si leur annonce par haut-parleur est inopérante, chaque annonce ou sommation peut être remplacée par le lancement d'une **fusée rouge** » [V S58][S23].
- **Textes exacts** (article R. 211-11 du code de la sécurité intérieure, version 2021, repris mot pour mot par l'instruction de la gendarmerie de 2022) [V S58][S23] :
  1. « Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux »
  2. « Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux »
  3. « Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux »
- « En cas d'usage des armes, la dernière sommation doit être réitérée » : c'est le cas avant l'emploi des grenades tirées au lanceur [V S58][S1]. Les sommations doivent être **répétées à chaque nouvelle séquence** (nouveau lieu, nouveau moment) et chaque fois que nécessaire pour être comprises [V S58].
- **Signe distinctif** : l'autorité et, le cas échéant, l'officier de police judiciaire qui prononce les sommations « doivent porter une écharpe ou un brassard tricolores » (article R. 211-12) ; la présence physique de l'autorité est impérative [V S58].
- **Sans sommation** : si des violences ou voies de fait sont exercées contre la troupe, ou si elle ne peut défendre autrement le terrain qu'elle occupe, le commandant de la force peut employer la force directement ; il est alors demandé, quand c'est possible, des « **avertissements non formalisés** mais indiquant clairement la nature de ces manœuvres et de ces moyens » [V S58].

### 1.6 Effectifs utiles à la mise en scène

| Unité | Composition | Effectif | Fiabilité |
|---|---|---|---|
| Compagnie de CRS | 1 section de commandement et de services (15–20) + **4 sections** de service général : 2 sections d'appui et de manœuvre + 2 sections de protection et d'intervention ; scindable en deux demi-compagnies (« Demi-Alpha », « Demi-Bravo ») | ≈ **130** policiers ; 60 compagnies (64 avec les créations récentes), ≈ 11 150 agents | [V S9][S2] |
| Section de CRS en maintien de l'ordre | 3 groupes tactiques « A », « B », « C » | **16** personnels | [V S2][S9] |
| Groupe tactique | plus petit élément manœuvrant (au-dessous : le binôme, hors maintien de l'ordre) | **6** personnels | [V S2] |
| Escadron de gendarmerie mobile | 5 pelotons : 1 hors rang (soutien), 3 de marche, 1 d'intervention ; sur le terrain, un groupe de commandement + 3 ou 4 pelotons | ≈ **110–120** ; pelotons de **16** ; 116 escadrons, ≈ 12 500 militaires | [V S12][S11][S2] |
| Unités parisiennes | compagnies de sécurisation et d'intervention de la préfecture de police ; BRAV-M constituées de binômes motorisés | ≈ 1 500 policiers pour les compagnies | [V S2] |
| Module tactique parisien (2023) | « groupe d'appui projeté » : **2 compagnies de CRS ou 2 escadrons + 1 commissaire**, qui suit le cortège par les rues adjacentes, véhicules à distance | intervention à pied « en moins de 30 secondes » | [V S2] |

> **Ce que le jeu doit reproduire — section 1**
> - Trois silhouettes immédiatement distinctes : CRS (casque sombre à **deux bandes jaunes**, écusson rouge), gendarme mobile (casque **tout bleu**, lettres « GENDARMERIE », insignes or), BRAV-M (tout noir, **casque de moto** conservé à pied, toujours par deux).
> - Le policier en civil n'est légitime que **brassard visible** ; sans brassard, les PNJ et la presse le traitent comme un inconnu.
> - Le commissaire est le seul personnage portant l'**écharpe tricolore** ; tant qu'il n'a pas prononcé les trois annonces (textes ci-dessus, mot pour mot, au mégaphone), l'emploi de la force « sur ordre » est une faute ; seule exception : la riposte directe à des violences ou la défense du terrain occupé (§ 3.5), avec si possible un avertissement oral.
> - Chaque agent affiche un **code de groupe** lisible (« 1A », « 2C »…) et un **RIO à 7 chiffres** : c'est ce que filment journalistes et observateurs, et ce que retient l'enquête IGPN.
> - Le grade se lit sur les épaules ; la convention casque du tableau 1.3 est un choix de lisibilité, à signaler comme tel dans l'encyclopédie du jeu.

---

## 2. Équipements individuels

### 2.1 Boucliers

| Bouclier | Apparence | Dimensions | Masse | Couleur / marquage | Emploi | Fiabilité |
|---|---|---|---|---|---|---|
| Rectangulaire de MO (bouclier de ligne) | Plaque de **polycarbonate transparent** légèrement cintrée, bords arrondis, double poignée + sangle d'avant-bras à l'intérieur. | **1,00 × 0,57** ; épaisseur ≈ 0,004 | **3,5 à 4,8 kg** selon le modèle | transparent (teinte `#CFE3EA`, opacité 0,25) ; rayures et impacts visibles ; marquage **[NT]** → [E] bandeau « POLICE » blanc en haut, 0,30 × 0,07 | mur de boucliers, bond offensif, protection contre projectiles | cotes et masse : fiche d'un fabricant, pas la dotation officielle [P S47] ; les modèles **rectangulaires ont remplacé les ovoïdes** jugés trop fragiles [P S53] |
| Rond / petit bouclier d'intervention | Disque de polycarbonate, une poignée centrale + sangle. Historiquement, la gendarmerie mobile a reçu un bouclier « transparent et léger, d'abord rond puis ovoïde ». | **[NT]** → [E] Ø 0,55 à 0,60 ; ép. 0,004 | [E] ≈ 2,5 kg | transparent | sections d'intervention / interpellateurs : laisse une main libre et permet de courir | historique [V S12] ; cotes [E] |
| « Carré » (gendarmerie, pelotons d'intervention) | Plus petit que le rectangulaire. | **[NT]** → [E] 0,60 × 0,60 | [E] 2,5 kg | transparent | interpellation | répartition rectangulaire = pelotons de marche / carré = pelotons d'intervention [P S53] |
| Balistique | Bouclier opaque lourd avec hublot. | [E] 0,90 × 0,50 | [E] 8–10 kg | noir `#15171A` | dotation « plus spécialisée » ; pas en manifestation ordinaire | existence [V S2] |

### 2.2 Bâtons

| Objet | Apparence | Dimensions | Masse | Fiabilité |
|---|---|---|---|---|
| Bâton de défense | « matraque en caoutchouc, munie d'une petite dragonne souple », cylindrique, noire. | longueur **[NT]** → [E] 0,50 à 0,60 ; Ø 0,03 | [E] 0,45 kg | description [P S48] (réponse ministérielle, résumé) |
| Tonfa (bâton à poignée latérale) | Bâton droit noir avec poignée perpendiculaire à ≈ 0,14 d'une extrémité ; porté à la ceinture dans un anneau. | ≈ **0,59 à 0,615** ; Ø 0,03 ; poignée 0,13 | ≈ **0,6 kg** | cotes d'un modèle du commerce [P S48b] ; dotation [NT] |
| Matraque télescopique | Tube d'acier en 2 ou 3 segments, déployé d'un geste sec ; pliée, tient dans un étui de ceinture. | déployée ≈ **0,53** (plage 0,40–0,70) ; pliée ≈ 0,20–0,23 | 0,4 à 0,7 kg | « mini-bâtons extensibles en deux ou trois segments » [P S48] ; cotes commerce [P S48b] |

### 2.3 Autres équipements portés

| Objet | Apparence | Dimensions | Caractéristiques d'emploi | Couleur (hex [E]) | Fiabilité |
|---|---|---|---|---|---|
| Gazeuse à main (aérosol lacrymogène individuel) | Bombe cylindrique avec capot à gâchette, étui de ceinture. | [E] Ø 0,04 × 0,15 (≈ 75–100 ml) | jet de **gel CS** ; portée ≈ **5 m** pour 100 ml (fiche commerce) ; [E] 6–8 jets de 1 s | corps `#1A1A1A`, capot `#D62828` | CS = produit en dotation [P S48c] ; portée [P] ; contenance dotation **[NT]** |
| Gazeuse grande capacité | Grosse bombe à poignée-pistolet (type extincteur miniature), portée par 1 agent par groupe. | [E] Ø 0,07 × 0,30 (≈ 300–500 ml) | [E] cône de 6–8 m, 10–15 s de jet cumulé ; sert à repousser un groupe au contact | `#1A1A1A` | **[NT]** → tout [E] |
| Masque à gaz | Masque panoramique à large visière + cartouche filtrante latérale ou frontale ; modifie la voix (étouffée). | [E] 0,20 × 0,17 × 0,15 | [E] mise en place 8–10 s ; réduit le champ de vision et l'endurance | `#111111`, cartouche `#3A3A3A` | **[NT]** |
| Menottes | Menottes à chaîne ou charnière, acier. | [E] 0,24 × 0,08 | pose [E] 3–5 s sur individu maîtrisé | `#B0B4BA` | [E] |
| Liens plastiques | Colliers de serrage larges à usage unique, portés en bottes de 5–10 pour les interpellations multiples. | [E] 0,50 × 0,012 | pose [E] 2–3 s | noir `#0B0B0D` ou blanc `#E8E8E8` | [E] |
| Radio | Poste portatif à antenne courte + micro déporté d'épaule ; oreillette. Projet de terminaux type smartphone durci (transmission de voix, texte, images, géolocalisation). | [E] 0,13 × 0,06 × 0,035 | bip de prise de parole, saturation du réseau en crise [E] | `#111111` | terminaux durcis [V S45] ; reste [E] |
| Caméra-piéton | Boîtier rectangulaire fixé **sur le haut du torse**, objectif en façade, voyant d'enregistrement. | [E] 0,07 × 0,09 × 0,03 ; ≈ 0,16 kg | **≈ 12 h d'autonomie** (3 h pour l'ancienne génération) ; déclenchement par l'agent ; pré-enregistrement de 30 s sur un modèle antérieur ; 30 000 caméras achetées pour police et gendarmerie | `#111111`, voyant `#FF2A2A` | [P S49] ; port sur le haut du torse [P S49] ; cotes [E] |
| Extincteur | Petit extincteur portatif rouge, porté par 1 à 2 agents par section et présent dans chaque véhicule ; sert à éteindre un collègue ou un début de feu. | [E] 2 kg : Ø 0,11 × 0,36 ; 6 kg : Ø 0,16 × 0,52 | [E] 2 kg ≈ 6–8 s de jet, portée 3 m ; 6 kg ≈ 15 s, portée 4–5 m | rouge `#D0021B`, flexible noir | **[NT]** → [E] |
| Mégaphone | Porte-voix à pavillon, poignée-pistolet, micro à fil ; le commissaire peut aussi utiliser la sonorisation d'un véhicule. | [E] pavillon Ø 0,23, longueur 0,35 | [E] audible à 150–300 m en rue calme, 60–100 m dans le vacarme d'une manifestation | blanc `#F2F2F2` / gris `#6B7280` | haut-parleur exigé par le texte [V S23] ; cotes [E] |
| Lampe | Torche LED compacte à la ceinture ou sur l'épaule. | [E] Ø 0,03 × 0,14 | [E] faisceau 100–150 m | `#111111` | [E] |
| Arme de service | Pistolet semi-automatique 9 mm en étui ; ne sort qu'en légitime défense. | [E] 0,19 × 0,14 | — | `#111111` | modèle de dotation cité par [S9] (ne pas nommer en jeu) |
| Pistolet à impulsion électrique | — | — | **non autorisé en maintien de l'ordre** | — | [V S1][S11] |

> **Ce que le jeu doit reproduire — section 2**
> - Le bouclier rectangulaire **transparent** (1,00 × 0,57 m, ≈ 4 kg) : on voit l'agent à travers, il se raye, se fissure et prend la peinture ; il ralentit la course et occupe un bras (pas de lanceur ni de menottage bouclier en main).
> - Deux bâtons distincts : le tonfa (≈ 0,60 m, poignée latérale, parade + frappe) et la télescopique (0,53 m déployée, sortie rapide, portée moindre).
> - La gazeuse à main est une arme de **contact** (≈ 5 m) ; la grande capacité crée un cône de quelques mètres pendant quelques secondes : rien à voir avec les grenades.
> - Le masque à gaz se **met** (animation ≈ 8–10 s) et dégrade vision, voix et endurance ; sans lui, l'agent subit son propre gaz.
> - La caméra-piéton est un objet actif : voyant rouge, enregistrement déclenché par le joueur, pièce centrale des enquêtes.
> - Les liens plastiques permettent les interpellations en série ; les menottes sont limitées à une paire par agent.

---

## 3. Grenades et lanceurs

### 3.1 Grenades (toutes de calibre 56 mm, sauf munitions 40 mm)

| Grenade | Statut 2024 | Apparence | Dimensions / masse | Effet observable | Chiffres d'emploi | Fiabilité |
|---|---|---|---|---|---|---|
| Lacrymogène multi-palets « 6 palets » (CM6) | en service (lanceur et main) | Cylindre gris/aluminium avec marquages, bouchon allumeur à cuillère pour le lancer à main. | Ø **0,056** × **0,199** ; **340 g** | S'ouvre en vol ou à l'impact et **disperse 6 palets** qui fument chacun au sol en roulant. | **Durée d'émission : 30 s** ; **zone couverte : 800 m² sur 3 à 5 m de haut** | [P S6] (brochure 2012 reprenant les données du fabricant), confirmé par une fiche d'ONG [P] |
| Lacrymogène multi-palets « 7 palets » (MP7) | en service | Idem, autre fabricant. | Ø 0,056 ; longueur **[NT]** → [E] 0,20 | **Disperse 7 palets** de CS. | durée d'émission **[NT]** → [E] 30 s par analogie ; surface [E] ≈ 900 m² | 7 palets [P S44][S5] |
| Assourdissante-lacrymogène GM2L | **en dotation** ; depuis 2021, **tir en cloche au lanceur uniquement** (lancer à main abandonné) | Cylindre court à corps souple. | Ø **0,056** × **0,092** ; **150 g** | **Double effet : forte détonation + nuage instantané de poudre CS** ; « ne projette aucun éclat vulnérant » selon l'instruction officielle (des éclats de plastique sont néanmoins signalés). | **160 dB à 5 m, 155 dB à 10 m** ; portée maximale 200 m au lanceur ; mise en œuvre par un **binôme superviseur + lanceur** | effets, portée, binôme [V S1] ; statut et tir en cloche [V S2] ; cotes et dB [P S7] |
| GLI-F4 (lacrymogène instantanée à effet de souffle) | **retirée du service en 2020** | — | Ø 0,056 × 0,178 | Triple effet lacrymogène, assourdissant, souffle. | — | [V S2][S1] (à réserver à un mode « historique ») |
| Désencerclement GMD | **retirée du service**, remplacée par la **GENL** (« grenade à éclats non létaux »), « moins puissante » | Petit cylindre noir à cuillère, **roulée au sol**. | Ø 0,056 ; **248 g** | Forte détonation + **projection circulaire de 18 galets de caoutchouc** (9,3 g chacun). | **Retard 1,5 s** ; **rayon maximal d'efficacité 10 m** ; lancer jusqu'à **30 m** ; > 150 dB (165 dB selon une ONG) ; galets à ≈ 126 km/h | retard, 18 galets, 10 m, 30 m [V S1] ; statut [V S2] ; masse, vitesse [P S5][S6] |
| GENL (éclats non létaux) | **en dotation** | proche de la GMD. | **[NT]** | Détonation + projection de plots, puissance réduite. | **[NT]** → [E] rayon 7 m | existence et statut [V S2] |
| Assourdissante ASSD | **en dotation**, lancée **à la main** | Petit cylindre. | **[NT]** | Détonation seule ; jugée efficace pour disperser des groupes hostiles de type cortège radical, là où le gaz l'est moins face à des personnes portant lunettes et masques. | **[NT]** → [E] 155–160 dB à 5 m, rayon de sidération 8 m | [V S2] |
| Fumigène / lacrymogène 40 mm | en service avec les lanceurs multi-coups | Cartouche courte. | Ø 0,040 | fumée ou gaz | portées **50, 100 ou 150 m** (marché 2017) ; un nouveau modèle libère « deux fois plus de gaz » | [P S5][S43] |

Données économiques utiles au mode Carrière (prix unitaires relevés par la Cour des comptes) : GM2L **47,38 €**, GENL **55,80 €**, assourdissante **47,38 €** ; ≈ **9 800 tirs de grenades par an** pour l'ensemble des forces mobiles entre 2019 et 2022 [V S2]. Journée extrême : plus de 12 000 grenades lacrymogènes tirées à Paris le même jour selon la presse [P S51].

### 3.2 Portées selon le mode de lancement (grenades de 56 mm)

| Mode | Portée | Remarque | Fiabilité |
|---|---|---|---|
| À la main | **5 à 30 m** | bouchon allumeur à cuillère | [P S5][S6] |
| Lanceur + dispositif de propulsion à retard « 50 m » | **40 à 70 m** | — | [P S6] ; valeurs nominales DPR 50 / 100 / 200 m [V S1] |
| Lanceur + DPR « 100 m » | **80 à 120 m** | — | idem |
| Lanceur + DPR « 200 m » | **150 à 220 m** | portée maximale officielle : 200 m | idem |
| Temps de vol indicatif (calcul balistique sans frottement, tir à 45°) | 50 m ≈ 3,2 s ; 100 m ≈ 4,5 s ; 200 m ≈ 6,4 s ; apogée ≈ 12 / 25 / 50 m | à utiliser pour l'animation de la trajectoire en cloche | [E] (calcul) |

### 3.3 Lanceurs

| Lanceur | Apparence | Dimensions / masse | Cadence et emploi | Fiabilité |
|---|---|---|---|---|
| Lanceur de grenades 56 mm mono-tube | Gros tube court noir sur crosse repliable ; **la crosse impose une inclinaison de + 30°** (tir en cloche, pas de tir tendu) ; ne produit pas de bruit de détonation marqué (« pof » sourd). | **0,765** de long (0,435 plié) ; **3,67 kg** ; tube Ø intérieur 0,056 | **6 à 8 coups par minute** (≈ 8–10 s par rechargement) ; portée 50 à 200 m ; servi par un grenadier, sous l'autorité d'un superviseur | [P S5] ; binôme superviseur [V S1] |
| Version compacte 56 mm | Tube très court, protection rapprochée. | **0,388** (0,205 plié) ; **1,89 kg** | 6 à 8 coups/min | [P S6] |
| Lanceur multi-coups 40 mm | Fusil à **barillet rotatif de six chambres**. Les CRS se plaignent d'enrayements fréquents. | ≈ **0,87** crosse dépliée / 0,59 repliée ; **5,2 kg** | 6 grenades de 40 mm tirées en quelques secondes ; 180 exemplaires achetés en 2019 | six chambres [V S1] ; cotes [P S5] (la fiche inverse plié/déplié) ; enrayements, marché [P S43] |
| Lanceur bi-tube 40 mm | Deux canons superposés, crosse inclinée. | **[NT]** | appel d'offres de décembre 2023 (800 à 3 000 lanceurs) | [P S43] |
| Lanceur multi-tubes 56 mm sur trépied / pick-up (gendarmerie) | Bloc de **12 tubes** (versions 4, 8, 12 coups), purement mécanique. | ≈ **20 kg**, mis en œuvre par un binôme | tir quasi simultané de 12 grenades à 50, 100 ou 200 m ; 6 exemplaires achetés en 2024 | [P S43b] |
| Lance-grenades du Centaure | voir § 4.3 | — | 1 à 30 tirs en série | [V S3] |

### 3.4 LBD 40 (lanceur de balles de défense)

| Caractéristique | Valeur | Fiabilité |
|---|---|---|
| Type | lanceur **mono-coup**, **canon rayé basculant**, calibre 40 × 46 mm, crosse repliable ; « quasi-absence de recul » ; pas de bruit de détonation fort | [V S1][S5] |
| Dimensions / masse | **0,59** de long (0,39 crosse pliée) ; **2,05 kg** | [P S5][S6] |
| Viseur | « désignateur d'objectif électronique » (viseur holographique à point lumineux), **réglé pour 25 m, non modifiable par le tireur** | [V S1] ; réglage 25 m [P S8] |
| Munition | projectile semi-rigide Ø 0,040, longueur totale 0,096 (culot plastique + ogive caoutchouc/mousse) qui se déforme à l'impact | [V S1][P S5] |
| Vitesse | ≈ **92 m/s (330 km/h)** ; 90 à 100 m/s selon la munition | [P S5][S8] |
| Énergie | ≈ 84 J à 40 m | [P S8] |
| Portée utile, munition « longue » | tir optimum à **30 m** ; intervalle opérationnel **10 à 50 m** | [V S1] |
| Portée utile, munition « courte » | distance optimale **25 m** ; intervalle opérationnel **3 à 35 m** | [V S1] |
| Dispersion | viser à plus de 14 cm de la tête pour tenir compte de la dispersion mesurée à 25 m | [P S8] |
| Zones | **torse et membres** ; **la tête n'est pas visée** ; en deçà de l'intervalle, risque lésionnel accru | [V S1] |
| Cadence | mono-coup : [E] 4–6 s par rechargement | [E] |
| Emploi | arme collective sous habilitation, tir **sous la direction d'un superviseur** ; vise **un individu** (interpellation, agresseur), pas une foule ; seuls 10 % des tirs de LBD sont le fait des forces mobiles | [V S2][S1] |

### 3.5 Quand a-t-on le droit de s'en servir ? (annexe VIII de l'instruction de 2017)

| Arme | Après 2 sommations (emploi de la force décidé par l'autorité) | Après **réitération de la dernière sommation** (usage des armes décidé par l'autorité) | Sans sommation : violences / voies de fait contre les forces, ou défense du terrain (initiative du commandant de la force publique) | Légitime défense |
|---|---|---|---|---|
| Grenades lacrymogènes | **OUI, lancées à la main uniquement** | OUI | OUI | OUI |
| Lanceurs de grenades 56 mm et 40 mm | NON | OUI | OUI | OUI |
| Assourdissante-lacrymogène (GLI puis GM2L) | NON | OUI | OUI | OUI |
| Grenade de désencerclement | NON | OUI | OUI | OUI |
| LBD 40 | NON | NON | OUI | OUI |
| Pistolet à impulsion électrique | NON | NON | NON | OUI |

Source : [V S1]. L'engin lanceur d'eau suit le même régime : « emploi de la force décidé par l'autorité habilitée, après les sommations d'usage » [V S4].

### 3.6 Paramètres de simulation recommandés pour le gaz

| Paramètre | Valeur | Fiabilité |
|---|---|---|
| Couleur du nuage | blanc à gris clair, dense au sol puis translucide : cœur `#E4E6E1`, bord `#C7CBC6` (opacité 0,85 → 0,2) | « nuage blanc » [P S6] ; hex [E] |
| Source | 6 ou 7 palets projetés dans un rayon de 5 à 15 m autour du point d'impact [E], chacun fumant **30 s** [P S6] | mixte |
| Nuage cumulé d'une grenade | ≈ **800 m²** (disque de rayon ≈ 16 m), **3 à 5 m de haut** | [P S6] |
| Persistance après émission | [E] 60 à 180 s sans vent ; 20 à 40 s par vent > 15 km/h ; la pluie le rabat | [E] |
| Renvoi par les manifestants | un palet peut être ramassé (main gantée) ou renvoyé du pied pendant qu'il fume : le nuage se déplace avec lui | comportement décrit par le BRIEF ; paramètres [E] |
| Fusée de sommation | **fusée rouge** tirée vers le ciel ; [E] étoile rouge `#FF2A1A` montant à 60–80 m, visible 5–7 s | couleur et rôle [V S23] ; reste [E] |

> **Ce que le jeu doit reproduire — section 3**
> - La lacrymogène est une munition **à sous-munitions** : 6 ou 7 palets, 30 s de fumée chacun, ≈ 800 m² couverts, nuage **blanc** haut de 3 à 5 m, entièrement dépendant du vent.
> - Trois distances de tir au lanceur 56 mm (**50, 100, 200 m**), toujours **en cloche** : le grenadier choisit le dispositif de propulsion avant de tirer ; 6 à 8 coups par minute.
> - La GM2L est un **bang + nuage instantané** (160 dB à 5 m) ; la désencerclement / GENL est un **bang + 18 projectiles dans 10 m**, retard 1,5 s, roulée au sol : arme de dégagement rapproché, jamais de dispersion à distance.
> - Le LBD est une arme **individuelle et supervisée** : viseur réglé à 25 m, utile de 10 à 50 m, torse et membres uniquement ; un tir à la tête ou à bout portant est une bavure.
> - Le tableau 3.5 est la **matrice de légalité** du jeu : chaque tir est comparé à l'état des sommations et à la présence de violences ; hors case « OUI » → rapport défavorable, enquête.
> - Depuis 2020-2021 les grenades les plus dangereuses sont retirées (GLI-F4, GMD) ou restreintes (GM2L au lanceur seulement) : le jeu « contemporain » ne doit proposer que les munitions « en dotation ».
> - Chaque munition a un **coût** (≈ 47 à 56 €) : matière à un budget de compagnie et à un compte rendu d'emploi (nombre de tirs, distance estimée, cadre légal) rempli en fin de mission.

---

## 4. Véhicules

### 4.1 Véhicules de la police (CRS, préfecture de police)

| Véhicule | Gabarit (L × l × h) | Capacité / équipage | Apparence et livrée | Équipements MO | Fiabilité |
|---|---|---|---|---|---|
| **Fourgon de CRS** (fourgon de service général) | grand fourgon tôlé : [E] **5,6 à 6,0 × 2,05 × 2,55** (hors rétroviseurs), PTAC 3,5 t | **6 personnes** par véhicule (un groupe tactique) ; la police « privilégie les véhicules de taille moyenne (6 personnes) » | carrosserie **blanche** ; « POLICE » en grandes capitales ; bandes de couleur ; « nouvelles couleurs » depuis 2021 | [E] grilles métalliques rabattables devant le pare-brise et les vitres latérales, rampe lumineuse bleue de toit, haut-parleur, râteliers à boucliers, coffres à grenades | capacité [V S2] ; modèles et « nouvelles couleurs 2021 » [V S9] ; parc ≈ 625 fourgons en cours de remplacement (380 commandés) [P S46] ; cotes et grilles [E] |
| **Car de transport** | [E] autocar **12,0 × 2,55 × 3,30** (un modèle d'autocar est cité dans le parc CRS) | [E] 40–50 places | blanc, « POLICE », vitres parfois grillagées | soute à matériel | modèle cité [V S9] ; cotes **[NT]** |
| **Véhicule de commandement** (poste de commandement de compagnie) | [E] fourgon surélevé **6,0–7,0 × 2,10 × 2,80** | [E] 4–5 (commandant, radio, conducteur) | blanc, « POLICE », plusieurs antennes fouet (≈ 1,5 m) sur le toit, auvent | radios, cartographie, retour vidéo drone | existence (« véhicules de commandement, de groupe et d'atelier ») [V S9] ; cotes **[NT]** |
| **Voiture sérigraphiée** | SUV compact [E] **4,64 × 1,84 × 1,65** | 4–5 | carrosserie **grise** (gris métallisé) sur la génération livrée fin 2020 (1 263 exemplaires pour police et gendarmerie), sérigraphie « Police » **bleu et rouge**, le blanc étant plus discret ; anciennes générations blanches | rampe bleue de toit | couleur et sérigraphie [P S52] ; cotes [E] |
| **Fourgon cellulaire / transport d'interpellés** | [E] grand fourgon **6,0 × 2,05 × 2,6** | [E] 2 agents + 6 à 9 personnes retenues en compartiments | blanc, « POLICE », vitres arrière occultées ou grillagées | cellules individuelles, banquettes | **[NT]** → [E] |
| **Moto de BRAV-M** | trail routier ≈ 1 200 cm³ : empattement **1,54** ; hauteur de selle **0,845–0,870** ; [E] 2,25 × 0,98 × 1,41, ≈ 260 kg | **2 : un pilote + un opérateur passager** qui descend pour intervenir | [E] moto sombre ou blanche sans gros marquage, feux bleus de calandre | top-case, [E] LBD et grenades portés par le passager | binôme [V S2][S21] ; plus d'une centaine de motocyclistes à la 24e compagnie en 2024 [P S21] ; modèle de trail 1 200 cm³ [P S22] ; empattement et selle [V S57] ; reste [E] |
| Motos des autres unités | — | 1 | blanc/bleu, carénage | — | unités motocyclistes citées [V S9] |
| Obstacles de rue (« barre-pont »), camions 4×4, motopompes | — | — | matériels des sections de moyens spécialisés | — | [V S9] |

### 4.2 Engin lanceur d'eau (ELE, « canon à eau »)

| Donnée | Valeur | Fiabilité |
|---|---|---|
| Qui en possède | **Police nationale uniquement** (CRS, sections des moyens spécialisés ; préfecture de police). La gendarmerie « n'envisage pas l'acquisition de canons à eau… pour privilégier le recours aux engins de la Police nationale ». | [V S4][S45] |
| Parc CRS (réponse ministérielle, décembre 2018) | **9 engins de trois familles** : 2 + 2 camions-citernes ne projetant **que de l'eau** ; 2 engins à citerne d'eau **+ 3 citernes d'additifs (émulsifiant, lacrymogène, colorant)** ; 3 engins à cuve d'eau + compartiment d'émulsifiant anti-incendie + compartiment de produit d'auto-protection | [V S4] |
| Additifs | l'émulsifiant (mousse anti-incendie) est mélangé à l'eau **en sortie de lance à 6–7 %** ; il sert à éteindre **barricades, poubelles et véhicules en feu** ; selon le ministère, **le colorant et le lacrymogène n'ont jamais été utilisés contre des manifestants** | [V S4] |
| Pression du jet | **20 bars** (chiffre de presse repris dans la question parlementaire) ; 15 bars réglables sur un engin de constructeur français | [P S4][S17] |
| Capacité de cuve | parc CRS : **[NT]** (les désignations « 4000 » et « 6000 » des camions-citernes suggèrent 4 000 et 6 000 litres, non confirmé). Référence constructeur français : **10 000 litres** (grand modèle) ou **7 000 litres** (modèle léger). Ordre de grandeur international : 8 000 à 9 000 litres. | [P S17][S18] |
| Portée du jet | **60 m** (donnée constructeur) ; 65 m pour un engin allemand de 9 000 litres ; [E] portée utile en jet droit 30–40 m, en jet diffusé 15–20 m | [P S17] ; engin allemand : résumé de recherche (article Wikipédia anglais « Wasserwerfer 9000 », non relu) |
| Débit | ≈ **15 litres/seconde** (900 l/min) pour un engin moderne ; pression jusqu'à 30 bars | [P S18] (article peu sourcé) |
| Autonomie de tir | [E] 10 000 l à 15 l/s = ≈ **11 minutes de jet continu** ; en pratique, rafales de 3–10 s | calcul [E] |
| Tourelles | **2 canons** de toit sur le grand modèle, 1 sur le modèle léger ; orientables depuis la cabine | [P S17] |
| Équipage | **3** (grand modèle) ou **2** (modèle léger) : [E] conducteur, chef d'engin, opérateur(s) canon | [P S17] |
| Gabarit | grand modèle **9,67 × 2,60 × 3,72**, PTAC **29 t** ; modèle léger **7,50 × 2,54 × 2,50**, **21 t** | [P S17] |
| Protection | grilles et protections de vitres (option), **caméras périphériques 360°** | [P S17] |
| Livrée | [E] blanc `#F4F5F7`, « POLICE » bleu, cabine grillagée, rampe bleue ; engins plus anciens bleu foncé | **[NT]** → [E] |
| Consommation réelle | plus de **136 000 litres** projetés à Paris au cours d'une journée de violences de fin 2018, selon la presse (périmètre exact à recouper) | [P S51] |
| Cadre d'emploi | « moyens d'appui ayant uniquement vocation à faciliter et appuyer les manœuvres des unités constituées » ; emploi **après les sommations**, décidé par l'autorité habilitée ; nécessité, proportionnalité, gradation | [V S4] |

### 4.3 Centaure (véhicule d'intervention polyvalent de la gendarmerie)

| Donnée | Valeur | Fiabilité |
|---|---|---|
| Dimensions | **longueur 7,5 ; largeur 2,94 ; hauteur 3,82** | [V S3] |
| Masse | **14,5 tonnes** | [V S3][S2] |
| Moteur / vitesse | **300 ch** ; ≈ **100 km/h** | [V S3] ; vitesse [P S14][S16] |
| Blindage | niveau STANAG 2 ; pressurisation et filtres pour milieu contaminé | [V S3][S16] |
| Équipage | **3 opérateurs** (pilote, chef d'engin, opérateur radio/tir) **+ 7 passagers**, ou une équipe médicale avec son matériel | [V S3] ; rôles [P S16] |
| Lame avant | lame hydraulique de dégagement : pousse/tire **12 t de masse immobilisée** (un bus à vide) ou **31 t sur roues** ; **percussion de 3,5 t jusqu'à 30 km/h** | [V S3] |
| Lance-grenades | sur tourelleau **téléopéré** : « **de 1 à 30 tirs en série** permettant une gradation de la force » → modéliser un bloc de **30 tubes** | [V S3] ; « 30 coups » [P S15] ; rechargement permettant une seconde salve de 30 : [P] (résumé de recherche, non relu) ; cadence entre deux tirs **[NT]** → [E] 0,2 à 0,5 s |
| Autres armes | montage **possible** d'une mitrailleuse de 7,62 mm (bâchée / retirée en maintien de l'ordre) ; **diffuseurs de lacrymogène autour de la caisse** | [V S3] ; diffuseurs [P S15] |
| Capteurs | **vision à 360°** (caméras périphériques), vision **longue distance jour/nuit de 3 à 9 km** (caméra thermique), **détection d'ouverture du feu** (micros) | [V S3] ; détails [P S15][S16] |
| Couleur | **bleu profond** (livrée gendarmerie) ; [E] `#1B2F5E`, marquage « GENDARMERIE » blanc | [P S15] ; hex [E] |
| Parc | **90 véhicules** (56 en métropole, 34 outre-mer ; un tiers en Île-de-France, basé à Satory) ; programme ≈ 70 M€ ; premières livraisons 2022 | [V S3][S2] |
| Sonorisation | capacité de communication de type « public-address » (haut-parleur extérieur) prévue pour les blindés polyvalents | [V S58] |
| Emploi | premier engagement lors des violences urbaines de juin-juillet 2023 ; « d'abord destiné à sécuriser l'intervention des personnels, lesquels peuvent progresser à pied et bénéficier de sa protection blindée » ; en maintien de l'ordre, l'engagement d'un blindé « est décidé par les autorités gouvernementales » | [V S3][S58] |

Note de cohérence : la Cour des comptes décrit le Centaure comme « 1 m plus long et 0,5 m plus haut » que son prédécesseur [S2], ce qui donnerait ≈ 3,05 m de haut ; la fiche du constructeur du véhicule de base indique 7,4 × 3,3 m [P]. La hauteur officielle de 3,82 m inclut vraisemblablement tourelleau et antennes : modéliser la **caisse à ≈ 3,0–3,3 m** et le **sommet du tourelleau à 3,82 m** [E].

### 4.4 Ancien blindé (VBRG)

| Donnée | Valeur | Fiabilité |
|---|---|---|
| Dimensions | **6,04** de long (**6,175** avec lame) ; largeur **2,50** ; hauteur **2,55** avec tourelleau | [V S13] |
| Masse | **12,7 t** en ordre de marche | [V S13][S2] |
| Équipage | **3** (conducteur, opérateur de tourelle, chef de bord) **+ 6 à 8** gendarmes | [V S13][S2] |
| Moteur / vitesse | 170 ch ; **85 km/h** | [V S13] |
| Armement MO | lance-grenades de 56 mm (un coup à la fois), lame/boutoir hydraulique ; mitrailleuse 7,62 mm | [V S13][S2] |
| Aspect | 4 roues, caisse anguleuse **bleue** ; en service depuis 1974 ; une soixantaine encore roulants en métropole | [V S13][S2] ; hex [E] `#23407A` |

### 4.5 Véhicules de la gendarmerie mobile (pour mémoire)

Deux véhicules de groupe par peloton (fourgons bleus, jusqu'à **9 personnes**), 128 véhicules de commandement et de transmission, renouvellement de **1 180 véhicules** en 2023-2024 ; les nouveaux véhicules sont **bleus à sérigraphie jaune** [V S2][S45] ; [P S11b]. Camion tactique à **barrières rétractables** (« dispositif de retenue autonome du public ») : grilles déployées de part et d'autre du camion, « seul moyen passif de distanciation avant le recours au gaz » [V S45] ; **trois à cinq vantaux selon la largeur de l'axe**, emploi **défensif et statique uniquement** (jamais dans une charge ou une vague de refoulement), décidé au niveau zonal ; « impact psychologique fort », militaires abrités derrière les grilles [V S58] ; cotes **[NT]** → [E] vantaux de 3 m de haut × 2,5–3 m, front total 8–15 m.

### 4.6 Véhicules de secours parisiens

| Véhicule | Gabarit [E] | Équipage | Livrée | Fiabilité |
|---|---|---|---|---|
| Engin-pompe polyvalent des sapeurs-pompiers de Paris (« premier secours ») | 6,5 × 2,30 × 2,90 | **6 sapeurs-pompiers**, commandés par un sous-officier ; incendie **et** secours à victimes | rouge `#C8102E`, bande rétroréfléchissante jaune/blanche, « SAPEURS-POMPIERS DE PARIS » en blanc, rampe bleue | équipage et polyvalence [V S56] ; cotes et livrée [E] |
| Véhicule de secours et d'assistance aux victimes | 5,8 × 2,10 × 2,70 | **3** : chef d'agrès, conducteur, équipier | rouge, cellule sanitaire | [V S56] ; cotes [E] |
| Ambulance de réanimation (pompiers ou SAMU) | 6,0 × 2,10 × 2,80 | **médecin + infirmier + conducteur** | pompiers : rouge ; SAMU : **blanc** `#FFFFFF`, « SAMU » bleu `#003DA5`, chevrons arrière jaune fluo/rouge | équipage [V S56] ; livrée SAMU **[NT]** → [E] |
| Échelle aérienne | 10,0 × 2,50 × 3,30 | 2–3 | rouge | existence [V S56] |

Appels : 18 / 112 pour les pompiers de Paris (qui traitent aussi le 17 à Paris depuis 2016) [V S56] ; 15 pour le SAMU (numéro national, non sourcé ici).

### 4.7 Sirènes « deux tons » (valeurs réglementaires)

| Service | Ton 1 | Ton 2 | Cadence | Durée d'un ton (calcul) | Ressenti |
|---|---|---|---|---|---|
| **Police** nationale et municipale, douanes | **435 Hz** | **580 Hz** | **50 à 60 cycles/min** | ≈ 0,50–0,60 s | rapide, intervalle de quarte (la–ré) |
| **Gendarmerie** | **435 Hz** | **732 Hz** | 50 à 60 cycles/min | ≈ 0,50–0,60 s | rapide, intervalle large (la–fa dièse) |
| **Sapeurs-pompiers** | **435 Hz** | **488 Hz** | **25 à 30 cycles/min** | ≈ 1,0–1,2 s | lent « pin-pon », un ton d'écart (la–si) |
| **SAMU / SMUR** | **435 Hz** | **651 Hz** | 50 à 60 cycles/min | ≈ 0,50–0,60 s | rapide, quinte (la–mi) |
| Ambulances privées (à la demande du SAMU) | 420 Hz – 516 Hz – 420 Hz | puis silence ≈ 1,5 s | — | — | « trois tons » |

Source : [P S19] (tableau reconstitué d'après l'arrêté du 3 novembre 1987 cité par l'article), recoupé pour le 435 Hz commun et le 580 Hz de la police [P S20]. Synthèse WebAudio : deux oscillateurs carrés/dents de scie filtrés passe-bande, alternés sans glissando, + effet Doppler [E].

### 4.8 Feux et gyrophares

| Élément | Valeur | Fiabilité |
|---|---|---|
| Couleur | **bleu** pour les véhicules prioritaires (police, gendarmerie, pompiers, SAMU : dispositifs de « catégorie A ») ; orange pour les véhicules de chantier | [P S19b] |
| Forme | rampe de toit à LED (≈ 1,1–1,4 × 0,30 × 0,08 [E]) ; feux de calandre ; gyrophare magnétique amovible sur véhicules banalisés | [E] |
| Rythme | [E] 2 à 4 éclats par seconde, doubles flashs alternés gauche/droite ; hex `#1E5BFF`, halo `#7FA8FF` | **[NT]** → [E] |

> **Ce que le jeu doit reproduire — section 4**
> - Le fourgon blanc de CRS transporte **6 agents** (un groupe) ; ordre de grandeur [E] : une section de 16 = 3 fourgons, une compagnie = une colonne d'une vingtaine de véhicules + véhicule de commandement hérissé d'antennes.
> - L'ELE : gros camion à **1 ou 2 tourelles**, ≈ 7 000–10 000 l, jet utile jusqu'à ≈ 60 m, ≈ 15 l/s soit une dizaine de minutes de jet ; il sert **aussi à éteindre** barricades et véhicules en feu (mousse) ; emploi après sommations ; il doit **se ravitailler** quand la cuve est vide.
> - Le Centaure : 7,5 × 2,94 × 3,82 m, 14,5 t, bleu profond, 3 + 7 personnes, **lame** qui pousse les barricades et les carcasses (jusqu'à 12 t à l'arrêt), **salve réglable de 1 à 30 grenades**, caméras 360° + thermique, pas de mitrailleuse en maintien de l'ordre ; engin rare (appui exceptionnel), jamais un véhicule de patrouille.
> - Les BRAV-M arrivent par **paires de motos**, le passager saute et interpelle, puis repart : mobilité très supérieure aux unités à pied.
> - Quatre signatures sonores à synthétiser avec les fréquences du tableau 4.7 : police (435/580 rapide), gendarmerie (435/732 rapide), pompiers (435/488 **lent**), SAMU (435/651 rapide). Le joueur doit pouvoir reconnaître qui arrive à l'oreille.
> - Tous les feux d'urgence sont **bleus** ; l'orange est réservé aux véhicules de voirie.

---

## 5. Drones et hélicoptère

| Sujet | Donnée | Fiabilité |
|---|---|---|
| Cadre légal des drones | articles L. 242-1 et suivants du code de la sécurité intérieure (notamment L. 242-5) ; **décret n° 2023-283 du 19 avril 2023** ; le Conseil d'État avait interdit en 2020 les drones de surveillance des manifestations à Paris faute de texte, puis a rejeté en mai 2023 la demande de suspension du décret | [P S42] |
| Autorisation | **arrêté du préfet de police pris événement par événement**, autorisant « la captation, l'enregistrement et la transmission d'images au moyen de caméras installées sur des aéronefs », avec **périmètre et plage horaire** ; publié au recueil des actes administratifs | [P S42b] |
| Parc | la préfecture de police utilise des drones depuis 2016 ; 142 drones saisis par la justice lui ont été remis en décembre 2023 | [P S42] |
| Modèle, gabarit | **[NT]** → [E] quadricoptère pliable gris : ≈ 0,35 × 0,28 × 0,11 (bras déployés, hors hélices), ≈ 0,9 kg ; variante lourde ≈ 0,80 d'envergure, 6 kg | [E] |
| Autonomie | **[NT]** → [E] 30–40 min par batterie (petit modèle), relève par un second appareil | [E] |
| Altitude d'emploi | **[NT]** → [E] 60 à 120 m au-dessus du cortège ; bourdonnement audible sous 80 m | [E] |
| Charge utile | [E] caméra stabilisée zoom + thermique ; interdiction de capter le son et d'utiliser la reconnaissance faciale : [E] (souvenir du texte de loi, **non relu** pendant cette recherche) ; la gendarmerie évoque des moyens « pouvant être délivrés à partir d'un drone » comme simple piste de réflexion | piste [V S45] ; reste [E] |
| Doctrine | drones employés « selon le principe de complémentarité avec les hélicoptères », par des personnels spécialement formés : éclairer la décision du commandant, renseigner les autorités, surveiller une zone ou un objectif, concourir à la police judiciaire | [V S58] |
| Télépilote | [E] binôme télépilote + opérateur image, posté sur un toit ou près du véhicule de commandement ; l'image arrive à la salle de commandement | [E] |
| Hélicoptère | la police recourt aux hélicoptères de la **gendarmerie** et de la sécurité civile ; des arrêtés autorisent aussi une **caméra montée sur hélicoptère** pour certaines manifestations ; appui possible par « **projecteurs lumineux de forte puissance** », surveillance de zone, cartographie d'urgence | [P S42b] ; projecteurs [V S58] |
| Appareil type | biturbine léger de la gendarmerie : **rotor Ø 10,20**, hauteur **3,51**, fuselage ≈ 10,20 ; masse maximale 2 980 kg ; croisière 261 km/h ; rayon d'action 620 km ; caméra, projecteur de recherche, treuil ; 15 exemplaires de ce type ; base en Île-de-France à Villacoublay | [V S41][S40] |
| Livrée, altitude | [E] bleu gendarmerie `#1F3A7A`, « GENDARMERIE » blanc ; vol stationnaire ou orbites à 300–600 m ; bruit sourd permanent qui couvre les slogans | **[NT]** → [E] |

> **Ce que le jeu doit reproduire — section 5**
> - Le drone n'est utilisable que si la mission comporte un **arrêté d'autorisation** (périmètre + horaires) : hors périmètre ou hors horaire, les images sont inexploitables et le télépilote est fautif.
> - Rôle de gameplay : repérer les départs de feu, les groupes qui se masquent, les dépôts de projectiles ; **marquer** des individus pour les interpellateurs ; une batterie ≈ 30–40 min, puis relève.
> - L'hélicoptère est un élément d'ambiance et de renseignement (caméra + projecteur la nuit), entendu avant d'être vu ; il ne tire jamais.
> - Aucun armement sur drone dans le jeu « contemporain » (simple piste de réflexion dans les sources).

---

## 6. Apparence des participants

Rappel BRIEF : syndicats, partis, mouvements et slogans **fictifs** ; les descriptions ci-dessous sont des archétypes visuels. La partie « cortège syndical » repose surtout sur l'observation générale des manifestations parisiennes (peu de sources chiffrées) : elle est marquée [E].

### 6.1 Structure d'un grand cortège parisien

| Bloc (de l'avant vers l'arrière) | Description | Effectif typique | Fiabilité |
|---|---|---|---|
| Pré-cortège / « cortège de tête » | Marche **devant** le carré de tête officiel ; mélange de manifestants non affiliés et de groupes radicaux vêtus de noir. | « quelques milliers de personnes » ; exemple : 14 500 personnes dont ≈ 1 200 en bloc noir le 1er mai 2018 ; plus de 1 500 en mars 2019 | [P S55][S24] |
| Carré de tête | Dirigeants des organisations derrière la **banderole de tête**, entourés du service d'ordre. | [E] 50–150 | [P S55] |
| Blocs des organisations | Chaque organisation derrière son camion et ses ballons. | de quelques centaines à plusieurs milliers par bloc | [P S55] ; visuel [E] |
| Fin de cortège | groupes divers, puis véhicules de nettoiement de la ville. | — | [E] |

### 6.2 Archétypes visuels

| Participant | Vêtements et accessoires | Objets portés (dimensions [E]) | Couleurs (hex [E]) | Fiabilité |
|---|---|---|---|---|
| **Manifestant syndical** | **chasuble** (gilet sans manches) aux couleurs de son organisation, autocollants, casquette, sifflet ; parfois fumigène de couleur à main. | **drapeau** 1,0 × 1,5 sur hampe de 2–3 m ; pancarte 0,5 × 0,7 sur manche de 1,2 m | chasubles rouge `#D62828`, orange `#F77F00`, bleu `#1D4E89`, violet `#6A4C93`, vert `#2A9D8F`, jaune `#F2C94C` | [E] |
| **Ballon de cortège** | gros ballon gonflé à l'hélium au logo (fictif) de l'organisation, retenu par des filins à un camion ou tenu par 2–4 personnes. | Ø 2,5 à 4 m, flottant à 4–8 m du sol | couleur de l'organisation | [E] |
| **Camion sono** | fourgon ou camion plateau roulant au pas, enceintes empilées, banderoles sur les ridelles, animateur au micro, groupe électrogène. | 6,0–7,5 × 2,3 × 3,2 | blanc + habillage de l'organisation | [E] |
| **Banderole de tête** | bande de tissu tenue à hauteur de poitrine par 10–15 personnes en ligne, slogan fictif en lettres capitales. | 8–12 × 1,2–1,5 | fond blanc ou couleur vive, lettres noires/rouges | [E] |
| **Service d'ordre** | brassards ou chasubles marqués « SERVICE D'ORDRE » / « SO », parfois casquettes identiques ; se tiennent par les bras en **chaîne** autour du carré de tête et le long du camion. | corde ou chaîne humaine | brassard rouge `#C1121F` ou fluo | existence d'un service d'ordre identifié [P S55b] ; visuel [E] |
| **Gilet fluo** | gilet de haute visibilité jaune à deux bandes rétroréfléchissantes, slogan manuscrit au dos. | — | jaune fluo `#DFFF00`, bandes `#C8CCD0` | [E] |
| **Membre du cortège radical (bloc noir)** | **vêtu de noir de la tête aux pieds**, capuche, visage masqué (cagoule, foulard), **lunettes de ski ou de plongée**, gants ; protections improvisées : **blousons de cuir, équipements de sport** ; sac à dos ; se change avant et après l'action pour ne pas être reconnu. | — | noir `#0B0B0D`, anthracite `#1C1C1F` | [V S24] ; masques à gaz et casques : [P S25] |
| **Banderole renforcée** | banderole de tête du bloc, **rigide**, tenue à plusieurs comme un bouclier collectif derrière lequel le groupe avance. | [E] 3–6 × 1,3–1,6 | noir, lettres blanches | existence [V S24] ; cotes [E] ; aucun détail de construction |
| **Parapluie** | parapluies ouverts en nombre pour masquer le groupe aux caméras/drones et dévier les jets. | Ø 1,0–1,2 | noir | **[NT]** (non mentionné par les sources lues) → [E] |
| **Cibles habituelles du bloc** | banques, agences d'intérim, enseignes de multinationales et de restauration rapide, panneaux publicitaires, **abribus, mobilier urbain, caméras** | — | — | [V S24] |
| **Street medic** | souvent **tee-shirt blanc à croix rouge ou bleue**, ou **brassard à croix rouge** ; **casque de skate**, masque à gaz, lunettes de protection ; cherche à ne pas être trop visible. | sac à dos de secours ; flacons de **sérum physiologique**, solution antiacide diluée pour rincer les yeux, compresses, pansements | tee-shirt `#F5F5F5`, croix `#D62828` ou `#1D4E89`, casque `#FFFFFF` ou `#D62828` | [P S25][S25b] |
| **Observateur associatif** | **chasuble et casque siglés** ; équipes de 2–3 qui se **présentent aux responsables du dispositif** avant d'observer ; notent, filment, ne participent pas. | carnet, téléphone, caméra légère | chasuble blanche `#F5F5F5` ou bleue, casque bleu `#2D6CDF`, mot « OBSERVATEUR » (texte générique à utiliser en jeu) | chasubles et casques siglés, équipe de trois [V S26] ; chasuble blanche et casque bleu [P S26b] |
| **Journaliste** | **casque**, **brassard « journaliste » / « PRESSE »**, **carte de presse apparente**, gilet pare-coups ; souvent masque à gaz et lunettes. | boîtier photo + téléobjectif, caméra d'épaule, perche micro, téléphone sur stabilisateur, sac | casque noir ou blanc marqué « PRESSE » en lettres contrastées ; brassard blanc `#FFFFFF` lettres noires | équipement minimal cité par le ministère (casque, brassard « journaliste », carte apparente, gilet) [P S27] ; marquage « PRESSE » sur le casque [E] |
| **Passant / riverain / touriste** | tenue de ville, sacs de courses, téléphone levé pour filmer. | — | palette neutre | [E] |

> **Ce que le jeu doit reproduire — section 6**
> - Un cortège a une **anatomie** : pré-cortège hétérogène et imprévisible devant, carré de tête protégé par un service d'ordre en chaîne, puis blocs colorés avec camions sono et ballons.
> - Le bloc radical est **noir, compact, masqué**, derrière une banderole renforcée ; ses membres se **changent** (un PNJ noir peut redevenir un manifestant ordinaire, et inversement), ce qui rend l'identification par drone et l'interpellation différée décisives.
> - Lunettes et masques rendent le gaz **moins efficace** sur le bloc que sur la foule pacifique [S2] : gazer large punit surtout les pacifiques → radicalisation (règle du BRIEF).
> - Street medics, observateurs et journalistes sont des **tiers protégés et identifiables** (croix, « OBSERVATEUR », « PRESSE ») : les toucher, les gazer à bout portant ou les interpeller sans motif est une faute lourde, filmée.
> - Les cibles du bloc sont prévisibles (banques, publicité, abribus, caméras) : matière à missions de protection de points sensibles.

---

## 7. Décor parisien

### 7.1 Immeuble haussmannien

| Élément | Règle / description | Valeur | Fiabilité |
|---|---|---|---|
| Hauteur de façade (à la corniche) selon la largeur de la rue | règlement de 1783-1784 : rue < 7,80 m → **11,70 m** ; 7,80 à 9,75 m → **14,62 m** ; > 9,75 m → **17,55 m**. Décret de 1859 : **20 m** sur les voies de plus de 20 m. Règlement de 1884 : 12 / 15 / 18 / 20 m. | tableau ci-contre | [V S28] |
| Combles | inscrits sous une **diagonale à 45°** partant de la corniche (1859) ; arc de cercle à partir de 1884 | [E] + 4 à 6 m au-dessus de la corniche → faîtage à ≈ 22–25 m | règle [V S28] ; hauteur totale [E] |
| Hauteur d'étage | minimum réglementaire **2,60 m** | [E] rez-de-chaussée 3,8–4,2 ; entresol 2,6–2,8 ; étage noble 3,3–3,6 ; étages courants 3,0–3,2 ; dernier étage 2,7–2,9 | minimum [V S28] ; détail [E] |
| Niveaux | **rez-de-chaussée** (boutiques, murs épais) ; **entresol** bas de plafond ; **2e étage « noble » avec balcon** ; 3e et 4e plus sobres ; **5e étage avec balcon filant continu, sans ornement** ; **toit mansardé à 45°** avec chambres et **lucarnes** | 6 niveaux sous corniche + combles | [V S29] |
| Façade | **pierre de taille** calcaire de teinte crème ; **balcons et corniches alignés d'un immeuble à l'autre** ; pas de saillie ni de retrait marqués ; ravalement obligatoire tous les dix ans (décret de 1852) | pierre propre `#E8DFC8`, ombrée `#CFC3A5`, patinée `#B9AE94`, joints `#A89C82` | [V S29] ; hex [E] |
| Balcons | dalle en saillie sur consoles, garde-corps en fonte ouvragée noire | [E] saillie 0,6–0,8 ; garde-corps 1,0 de haut ; `#16181B` | [E] |
| Fenêtres | portes-fenêtres hautes à petits bois, volets intérieurs ou persiennes | [E] 1,2–1,4 de large × 2,2–2,6 ; entraxe des travées 2,6–3,2 ; menuiseries `#F2EFE6` | [E] |
| Toiture | brisis en ardoise ou zinc, terrasson en **zinc** à joints debout, lucarnes, souches de cheminées en brique avec rangées de mitrons en terre cuite | zinc `#8E9AA6` (mouillé `#6F7B87`), ardoise `#4A5560`, mitrons `#B5533C` | [E] (toit mansardé [V S29]) |
| Porte cochère | grande porte à deux vantaux en bois peint | [E] 2,8–3,2 × 4,0–4,5 ; vert `#1F3D2B`, bleu `#1E2F4A`, rouge sombre `#5A1E1E` | [E] |
| Rez-de-chaussée commercial | devantures vitrées, stores bannes, enseignes (fictives), rideaux métalliques baissés les jours de manifestation à risque | vitrine [E] 2,5–5 de large × 2,8 de haut | [E] |
| Largeur des voies | largeur moyenne passée de **12 m à 24 m** sous Haussmann ; souvent **18 m** dans les nouveaux arrondissements | [E] grands boulevards 30–35 m, dont trottoirs 5–8 m plantés d'arbres tous les 6–10 m | [V S29] ; boulevards [E] |

### 7.2 Sols et pavés

| Élément | Description | Dimensions / masse | Couleur (hex [E]) | Fiabilité |
|---|---|---|---|---|
| Pavé de granit | provient de carrières du Tarn et de Bretagne ; la Ville stocke **20 000 à 30 000 tonnes** de pavés au dépôt de Bonneuil-sur-Marne et en recycle ≈ 10 000 t par an | dimensions **[NT]** → [E] gros pavé 0,14 × 0,20 × 0,14 (≈ 10,6 kg, calcul à 2,7 kg/dm³) ; pavé « mosaïque » 0,10 × 0,10 × 0,10 (≈ 2,7 kg) | gris `#6B6E72`, gris bleuté `#59606A`, luisant sous la pluie | provenance, stock [V S37] ; cotes [E] |
| Pavé de grès | **jaune**, rare, réservé aux monuments historiques et aux quais de Seine | idem | `#B89B5E` | [V S37] |
| Pose | [E] rangs droits, arcs de cercle (« queue de paon ») pour les pavés mosaïques | — | — | [E] |
| Chaussée courante | enrobé bitumineux, marquages blancs, pistes cyclables | — | `#2E2F33`, marquage `#EDEDED` | [E] |
| Bordure et caniveau | bordures de **granit** (achetées en Espagne) | [E] 0,30 de large, 0,14–0,18 de haut | `#8A8D91` | provenance [V S37] ; cotes [E] |
| Trottoir | asphalte gris, dalles de granit sur les axes prestigieux | — | `#4A4B4F` | [E] |

Gameplay : seuls les pavés « mosaïques » et les fragments (≈ 1–3 kg) sont des projectiles plausibles ; un gros pavé de ≈ 10 kg se **descelle** et sert de matériau de barricade [E].

### 7.3 Mobilier urbain

| Objet | Description | Dimensions | Couleur (hex [E]) | Fiabilité |
|---|---|---|---|---|
| **Fontaine Wallace** (grand modèle) | **fonte** ; soubassement de pierre, socle à huit pans, **quatre cariatides** dos à dos portant un **dôme à pointe orné de dauphins** | **hauteur 2,71 ; 610 kg** ; [E] emprise 0,8 × 0,8 | **vert profond** `#1F4D3A` | [V S30] ; 106 grands modèles à Paris en 2022 |
| Fontaine Wallace en applique / à colonnettes / petit modèle | variantes | 1,96 (300 kg) / 2,50 (≈ 500 kg) / 1,32 (130 kg) | idem | [V S30] |
| **Colonne Morris** | fût cylindrique d'affichage ; **marquise hexagonale à six mufles de lion**, **dôme bombé à écailles**, flèche à feuilles d'acanthe ; lumineuse la nuit, parfois rotative ; ≈ 4 m² d'affichage | hauteur et diamètre **[NT]** → [E] 5,5–6,2 de haut, fût Ø 1,3–1,4 | à l'origine « fonte verte » → `#1F4D3A` ; dôme identique | description, 550 colonnes [V S31] ; cotes [E] |
| **Kiosque à journaux** | édicule à dôme et frise (modèle historique de 1859 : octogonal, chêne, dôme en zinc) ; 360 kiosques remplacés en 2018-2019 par un modèle plus spacieux | **[NT]** pour le kiosque de presse → [E] 2,6 × 4,8 ouvert, 3,3 de haut ; un petit kiosque municipal habillé de cuivre mesure **2,40 × 2,40 × 2,50, 3 000 kg** | vert bouteille `#1F4D3A`, frise `#C9A227` | histoire [V S36] ; petit kiosque [V S35] |
| **Abribus** | toit plat, parois de verre, banc, caisson publicitaire lumineux | [E] 4,2 × 1,6 × 2,6 | acier gris `#6B7280`, verre `#CFE3EA` | [E] ; cible fréquente [V S24] |
| **Banc public** (banc double parisien) | lattes de bois sur piètements de fonte | [E] 2,0–2,2 × 0,75 (double) × 0,85 | lattes `#3C5A3C` ou bois `#7A5C3E`, fonte `#1F4D3A` | [E] |
| **Candélabre** | fût de fonte cannelé, lanterne à 4 faces (trottoirs) ; grand mât à crosse (boulevards) | [E] lanterne à 4–5 m ; mât routier 8–10 m ; base Ø 0,30 | `#22352C` / `#3B3B3B` ; lumière `#FFD7A1` | [E] |
| **Potelet** | tube anti-stationnement à tête sphérique claire | [E] 1,0–1,1 hors sol, Ø 0,06–0,08 (modèles du commerce) ; boule Ø 0,09 | brun `#4A3B32`, boule `#F2F2F2` | [P] cotes commerce ; standard parisien **[NT]** |
| **Grille d'arbre** | grille de fonte ajourée au pied des arbres d'alignement | [E] Ø 1,6–2,0 (ou carré 1,5) | `#3A3A3A` | [E] |
| **Entrée de métro Guimard** — entourage | balustrade de **fonte** à écussons, portique à deux **candélabres « brins de muguet »** terminés par des **verrines rouge orangé**, enseigne **« Métropolitain »** en lettrage Art nouveau | rambarde ≈ **1,25** de haut ; trémie d'escalier **3 m** de large ; [E] candélabres ≈ 4,5 de haut | **vert grisé** imitant le bronze oxydé `#3F5A4A` ; verrines `#E8502A` ; enseigne fond `#E9D8A6`, lettres `#2F4F3A` | [V S32] ; hex [E] |
| Entrée Guimard — édicule vitré | pavillon à marquise de verre | type A **5,85 × 3,75 × 4,00** ; type B **5,95 × 3,75 × 4,70** | idem ; verre jaune dépoli | [V S32] |
| **Corbeille de rue** | cerceau métallique portant un **sac plastique transparent** | [E] hauteur 1,0, Ø 0,45, ≈ 100 l | support `#5E6B66`, sac translucide vert `#B7D9A8` | [E] |
| **Bacs roulants** (les « poubelles » des barricades et des feux) | bac plastique à 2 ou 4 roues, couvercle coloré | [E] 240 l : 0,58 × 0,73 × 1,07 ; 660 l : 1,26 × 0,77 × 1,22 | cuve grise/verte `#2F5D3A`, couvercles vert `#3A7D44`, jaune `#F2C200`, blanc `#EDEDED` | [E] |
| **Feu tricolore** | mât avec caisson à trois feux, répétiteur piéton, bouton d'appel | [E] mât 3,3–3,6 ; caisson 0,30 × 0,95 ; lentilles Ø 0,20 | mât `#3B2F2A` ; rouge `#E10600`, orange `#FFB000`, vert `#00A651` | [E] |
| **Panneaux, plaques de rue** | plaque émaillée à fond bleu, lettres blanches, liseré vert | [E] 0,70–1,00 × 0,45 | bleu `#1B3A8C`, liseré `#2E7D4F` | [E] |

### 7.4 Barrières

| Barrière | Description | Dimensions | Couleur | Fiabilité |
|---|---|---|---|---|
| **Barrière Vauban** (barrière de police) | cadre tubulaire en **acier galvanisé**, barreaux verticaux, pieds plats, **crochets** latéraux pour les enchaîner | **hauteur 1,10** ; longueur **2,00 (14 barreaux)** ou **2,50 (18 barreaux)** ; espacement ≤ 0,11 ; **14 à 20 kg** | galvanisé `#A9AEB3` | [V S33] |
| **Barrière de chantier parisienne** (type A, cahier des charges 2019) | panneau plein **perforé** (trous Ø 5–6 mm), profil anti-affichage, lisse haute grise servant de main courante (≤ 4 cm), accrochage crochet/œillet | **hauteur totale 1,00** (panneau 0,89 + 0,11 de garde au sol) ; longueur ≤ **2,50** ; socles de **24–25 kg** ; version **2 m** avec rehausse grillagée (maille ≤ 80 × 300 mm) | **monochrome gris foncé RAL 7011 ou 7012** ≈ `#434B4D` / `#4E5754` | [V S34] |
| Ancienne barrière de chantier | panneaux à bandes verticales vertes et grises (génération antérieure, encore visible) | idem | vert `#3A7D44` / gris `#9AA0A6` | [E] (le cahier des charges mentionne seulement d'anciennes « bandes verticales ») |
| Barrière lourde / barre-pont / écran anti-émeute | obstacles de rue des sections spécialisées ; camion à barrières rétractables de la gendarmerie | **[NT]** → [E] écran 3,0 de haut, modules de 2,5 | acier `#4A4F57`, grillage | existence [V S9][S45] |

> **Ce que le jeu doit reproduire — section 7**
> - Un gabarit de rue crédible : façades alignées de **17,5 à 20 m** à la corniche (6 niveaux), combles à 45° en zinc au-dessus, **balcons filants au 2e et au 5e**, pierre crème, rez-de-chaussée commerçants ; les lignes horizontales continuent d'un immeuble à l'autre.
> - Le mobilier « vert parisien » (fontaine Wallace 2,71 m, colonne Morris, kiosques, bancs) et les entrées de métro Art nouveau donnent l'identité ; ce sont aussi des **obstacles, des abris et des matériaux** (abribus brisés, bacs roulants poussés en barricade puis incendiés, barrières Vauban et de chantier renversées et entassées).
> - Deux barrières à ne pas confondre : la **Vauban** grise à barreaux (1,10 × 2,00 m, 14–20 kg, s'accroche en ligne, se porte à deux mains) et la barrière de **chantier** pleine gris foncé (1,00 × 2,50 m sur socles de 25 kg).
> - Les pavés ne sont disponibles que sur les rues et places réellement pavées (donnée de carte) ; ailleurs, les projectiles viennent des chantiers, des terrasses et du mobilier.
> - Les rideaux métalliques baissés, les vitrines protégées par des panneaux de bois et les terrasses rentrées sont l'indice visuel d'une manifestation « à risque ».

---

## 8. Palette récapitulative (toutes valeurs [E], sauf RAL)

| Usage | Hex | Usage | Hex |
|---|---|---|---|
| Tenue CRS (marine) | `#1A2238` | Casque CRS | `#0F1420` |
| Bandes jaunes CRS | `#F5C400` | Écusson CRS | `#C8102E` |
| Protections rigides | `#15171A` | Lettres « POLICE » | `#FFFFFF` |
| Casque gendarme mobile | `#2F55A4` | Tenue gendarme mobile | `#0E1220` |
| Insignes or gendarmerie | `#C9A227` | Bleu Centaure | `#1B2F5E` |
| Brassard police civil | `#FF6A00` | BRAV-M (noir) | `#0B0B0D` |
| Écharpe : bleu / blanc / rouge | `#0055A4` / `#FFFFFF` / `#EF4135` | Franges argent | `#C9CED6` |
| Fourgon police (blanc) | `#F4F5F7` | Bleu police (bandes) | `#1D4E9E` |
| Feu bleu d'urgence | `#1E5BFF` | Fusée de sommation | `#FF2A1A` |
| Nuage lacrymogène | `#E4E6E1` → `#C7CBC6` | Polycarbonate (bouclier) | `#CFE3EA` à 25 % |
| Pompiers (rouge) | `#C8102E` | SAMU (bleu) | `#003DA5` |
| Pierre haussmannienne | `#E8DFC8` / `#CFC3A5` | Zinc des toits | `#8E9AA6` |
| Vert mobilier parisien | `#1F4D3A` | Vert Guimard | `#3F5A4A` |
| Pavé granit | `#6B6E72` | Enrobé | `#2E2F33` |
| Barrière Vauban | `#A9AEB3` | Barrière chantier (RAL 7011/7012) | `#434B4D` / `#4E5754` |
| Gilet fluo | `#DFFF00` | Bloc noir | `#0B0B0D` |

---

## 9. Sources

Statut de lecture : **(lu)** = document ouvert et lu pendant la recherche ; **(résumé)** = information connue seulement par le résumé du moteur de recherche (page non ouverte ou bloquée) — à recouper avant tout usage « encyclopédique » dans le jeu.

### 9.1 Sources primaires et institutionnelles

- **[S1]** Ministère de l'Intérieur, *Instruction n° 233 500 GEND/CAB du 27 juillet 2017 – n° 4585A DGPN du 2 août 2017 relative à l'usage et l'emploi des armes de force intermédiaire* (annexes LBD 40, grenade de désencerclement, lanceurs de grenades, GLI-F4, GM2L, tableau des cadres légaux) **(lu)** — https://www.gendarmerie.interieur.gouv.fr/content/download/27911/file/INSTRUCTION%20233500%2027%20juillet%202017.pdf
- **[S2]** Cour des comptes, *Les forces mobiles*, observations définitives, 2024 (effectifs, grenades en dotation et retirées, prix, véhicules, Centaure, BRAV-M, sections de 16 et groupes de 6) **(lu)** — https://www.ccomptes.fr/sites/default/files/2024-03/20240403-S2024-0185-Forces-mobiles.pdf
- **[S3]** Gendarmerie nationale, *Dossier de presse « Le Centaure »*, octobre 2023 **(lu)** — https://www.gendarmerie.interieur.gouv.fr/gendinfo/content/download/35384/file/Dossier%20de%20presse%20Centaure%20-%20octobre%202023.pdf
- **[S4]** Assemblée nationale, question écrite n° 12772 (15e législature), réponse du ministère de l'Intérieur publiée le 4 décembre 2018 (parc et emploi des engins lanceurs d'eau) **(lu)** — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE12772.pdf
- **[S58]** Direction générale de la gendarmerie nationale, *Instruction n° 200000/GEND/DOE/SDEF/BSOP du 26 juillet 2022 relative à la gestion de l'ordre public* (texte des sommations, fusée rouge, écharpe ou brassard, blindés, barrières rétractables, drones et hélicoptères) **(lu)** — https://www.gendarmerie.interieur.gouv.fr/content/download/27912/file/20220726_CIRCULAIRE-200000.pdf
- **[S12]** Musée de la Gendarmerie nationale, *La gendarmerie mobile en bref* (uniformes 1960-2010, casque bleu, boucliers) **(lu)** — https://www.gendarmerie.interieur.gouv.fr/musee/content/download/50529/file/LA%20GENDARMERIE%20MOBILE%20EN%20BREF.pdf
- **[S23]** Texte des sommations : article R. 211-11 du code de la sécurité intérieure (décret n° 2021-556 du 5 mai 2021), cité intégralement dans la fiche juridique associative « Point droit — Attroupement, ordre de dispersion » (4 octobre 2022) **(lu ; PDF récupéré pendant la recherche, adresse exacte non conservée)** ; le même texte figure mot pour mot dans [S58], source primaire à privilégier ; version officielle sur https://www.legifrance.gouv.fr (rechercher « R211-11 code de la sécurité intérieure »)
- **[S23b]** Analyse du décret du 5 mai 2021 (brassard tricolore, autorités habilitées) **(lu)** — https://blog.landot-avocats.net/2021/05/07/modernisation-et-clarification-des-sommations-a-effectuer-avant-de-disperser-un-attroupement/
- **[S34]** Ville de Paris, *Cahier des charges des barrières de chantier de type A*, janvier 2019 **(lu)** — https://www.api-site.paris.fr/paris/public/2018/11/cahier%20des%20charges%20barrières%20BVP2%20de%20type%20A%20Janvier%202019.pdf
- **[S35]** Ville de Paris, notice d'un kiosque habillé de cuivre (dimensions hors tout, masse) **(lu)** — https://cdn.paris.fr/paris/2024/08/01/gm-0159_a-notice-kiosque-cuivre-ville-de-paris-1-9kJd.pdf
- **[S36]** Ville de Paris, « Les kiosques à journaux, une page d'histoire parisienne » **(lu)** — https://www.paris.fr/pages/les-kiosques-a-journaux-une-page-d-histoire-parisienne-16294
- **[S37]** Ville de Paris, « Sur les traces des pavés parisiens » **(lu)** — https://www.paris.fr/pages/sur-les-traces-des-paves-parisiens-30446
- **[S45]** *Revue de la Gendarmerie nationale* n° 267, « Les outils du maintien de l'ordre : état et perspectives », 1er trimestre 2020 **(lu)** — https://www.gendarmerie.interieur.gouv.fr/crgn/content/download/27102/file/REVUE_267%20Les%20outils%20du%20maintien%20de%20l'ordre.pdf
- **[S53]** Sénat, avis budgétaire 2007-2008 (remplacement des boucliers ovoïdes par des rectangulaires) **(résumé)** — https://www.senat.fr/rap/a07-096-8/a07-096-81.pdf
- **[S54]** Police nationale, « Les CRS, 80 ans d'histoire » (bandes jaunes et écusson) **(résumé ; page bloquée à la lecture)** — https://www.police-nationale.interieur.gouv.fr/dossiers/80-ans-des-crs/crs-80-ans-dhistoire
- **[S55]** Assemblée nationale, commission d'enquête (16e législature), compte rendu d'audition décrivant carré de tête et pré-cortège **(résumé)** — https://www.assemblee-nationale.fr/dyn/16/comptes-rendus/cegrvimani/l16cegrvimani2223004_compte-rendu.pdf
- **[S27]** Assemblée nationale, question écrite n° 23754 (15e législature) — équipements des journalistes **(résumé)** — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE23754.pdf
- **[S48]** Assemblée nationale, question écrite n° 61276 (12e législature) — définition du bâton de défense et des télescopiques **(résumé)** — https://www.assemblee-nationale.fr/dyn/12/questions/QANR5L12QE61276.pdf
- **[S48c]** Assemblée nationale, question écrite n° 31283 (15e législature) — composition CS des moyens lacrymogènes **(résumé)** — https://www.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE31283.pdf
- **[S19b]** Assemblée nationale, question écrite n° 25814 (14e législature) — arrêté du 30 octobre 1987, dispositifs de catégorie A (feux bleus, deux-tons) **(résumé)** — https://www2.assemblee-nationale.fr/questions/detail/14/qe/25814/(vue)/pdf
- **[S42]** Drones : Conseil d'État (rejet du référé contre le décret du 19 avril 2023) ; analyse du décret ; interdiction de 2020 ; remise de 142 drones à la préfecture de police **(résumés)** — https://conseil-etat.fr/site/actualites/emploi-de-drones-a-des-fins-de-maintien-de-l-ordre-le-conseil-d-etat-rejette-la-demande-de-suspension-du-decret-du-gouvernement ; https://blog.landot-avocats.net/2023/04/20/drones-et-forces-de-lordre-un-decret-au-jo-pour-clore-continuer-une-longue-saga/ ; https://www.publicsenat.fr/actualites/societe/le-prefet-de-police-de-paris-prive-de-drones-par-le-conseil-d-etat-186395 ; https://www.justice.gouv.fr/actualites/actualite/142-drones-saisis-justice-remis-prefecture-police-paris
- **[S42b]** Recueils des actes administratifs de la préfecture de police (arrêtés autorisant la captation d'images par aéronefs, dont hélicoptère) **(résumés)** — exemple : https://www.prefectures-regions.gouv.fr/ile-de-france/ile-de-france/irecontenu/telechargement/113327/847658/file/recueil-75-2024-056-recueil-des-actes-administratifs-special du 29.01.2024.pdf

### 9.2 Organisations non gouvernementales, fabricants, presse

- **[S5]** ACAT, fiches d'identité des armes du maintien de l'ordre, novembre 2017 (désencerclement, GLI-F4, LBD 40, lanceur 56 mm, lanceur multi-coups) **(lu)** — https://www.acatfrance.fr/public/carteid-armes.pdf
- **[S6]** Brochure « Les armements du maintien de l'ordre » (mise à jour décembre 2012 ; source militante reprenant des fiches de fabricants ; mise en page confuse) **(lu)** — https://cras31.info/IMG/pdf/armement.pdf — et fiche d'ONG confirmant 6 capsules et 800 m² **(résumé)** — https://www.hrw.org/fr/modal/54527
- **[S17]** Constructeur français de véhicules spéciaux, fiche du véhicule lanceur d'eau (capacités, portée, équipage, gabarit) **(lu ; donnée constructeur, attribution à la préfecture de police connue par résumé seulement)** — https://www.soframe.com/us/security/crowd-control/vid-mf-crowd-control-vehicle
- **[S14]** Presse automobile, présentation du Centaure **(lu)** — https://www.caradisiac.com/7-passagers-100-km-h-lance-grenades-voici-le-centaure-nouveau-blinde-des-gendarmes-205118.htm
- **[S15]** Politis, « On a testé pour vous le Centaure », octobre 2023 **(lu)** — https://www.politis.fr/articles/2023/10/on-a-teste-pour-vous-le-centaure-le-nouveau-blinde-de-la-gendarmerie/
- **[S16]** Revue Conflits, entretien sur l'emploi des blindés de la gendarmerie **(lu)** — https://www.revueconflits.com/le-centaure-et-lemploi-des-blindes-dans-la-gendarmerie-entretien-avec-le-general-christophe-daniel/
- **[S43]** Politis, « Maintien de l'ordre : de nouveaux lance-grenades de 40 mm », décembre 2023 **(lu)** — https://www.politis.fr/articles/2023/12/maintien-de-lordre-de-nouveaux-lance-grenades-de-40-mm
- **[S43b]** Politis, « Arrivée discrète d'un lance-grenades multicoups », novembre 2024 **(lu)** — https://www.politis.fr/articles/2024/11/maintien-de-lordre-arrivee-discrete-dun-lance-grenades-multicoups
- **[S44]** Statewatch, armes employées lors d'une opération d'évacuation en 2018 (grenade à 7 palets) **(résumé)** — https://statewatch.org/news/2018/may/france-expulsions-in-the-zad-the-weapons-of-the-riot-police
- **[S46]** Économie Matin, remplacement des fourgons de CRS, 2026 (fiabilité moyenne) **(lu)** — https://www.economiematin.fr/?p=235643
- **[S47]** Distributeur d'équipements, boucliers de maintien de l'ordre 100 × 57 cm **(résumé)** — https://welkit.com/en/products/esp-maintien-de-l-ordre-bouclier
- **[S48b]** Revendeurs d'équipements (tonfa 61,5 cm / 600 g ; télescopique 53 cm) **(résumés)** — https://vetsecurite.com/en/defense-batons-nightsticks/43981-tonfa-de-defense-patrol-3700207810026.html ; https://revendeur.gkpro.fr/en/?p=22701
- **[S49]** 24matins, caméras-piétons (30 000 unités, 12 h d'autonomie) **(résumé)** — https://www.24matins.fr/les-policiers-equipes-desormais-de-30-000-cameras-pietons-performantes-1310172
- **[S50]** Reporterre, synthèse des textes officiels (numéro d'identification à sept chiffres) **(résumé)** — https://reporterre.net/Les-textes-officiels-encadrant-le-maintien-de-l-ordre
- **[S51]** Europe 1, bilan d'une journée de violences à Paris (grenades tirées, litres d'eau projetés) **(résumé)** — https://www.europe1.fr/faits-divers/information-europe-1-violences-a-paris-plus-de-12000-grenades-lacrymogenes-tirees-samedi-par-les-forces-de-lordre-3812480
- **[S52]** Presse automobile, nouvelle voiture de police grise à sérigraphie bleu et rouge **(résumé)** — https://lesvoitures.fr/renault-grand-scenic-police-nationale/ ; https://lesvoitures.fr/peugeot-5008-1-263-suv-pour-nos-forces-de-lordre/
- **[S22]** Topito, « trucs à savoir sur la BRAV-M » (modèle de moto ; source légère) **(résumé)** — https://www.topito.com/top-trucs-savoir-brav-m-police
- **[S22b]** Sortir à Paris, présentation de la BRAV-M (tenue noire, casque conservé) **(résumé)** — https://www.sortiraparis.com/actualites/a-paris/articles/291116-brav-m-quelle-est-cette-brigade-qui-fait-polemique-lors-des-manifestations
- **[S25b]** Slate, « Pourquoi les street medics sont devenus indispensables » ; brochures de secouristes de manifestation **(résumés)** — https://www.slate.fr/story/119445/street-medics-indispensables-manifestation
- **[S26]** Observatoire strasbourgeois des libertés publiques, rapport d'observation du 25 mars 2024 (« identifiables par leurs chasubles et casques siglés ») **(lu)** — https://www.ldh-france.org/wp-content/uploads/2024/04/Rapport_OSLIB_Manif_25_mars_2024.pdf
- **[S26b]** Communiqué d'un observatoire parisien des libertés publiques (chasuble, casque) **(résumé)** — https://www.ldh-france.org/wp-content/uploads/2019/04/CP-SAF-et-LDH-manif-17-nov-2020.pdf
- **[S55b]** Guide du manifestant d'une union syndicale (service d'ordre identifié) **(résumé)** — https://solidaires-douanes.org/IMG/pdf/guide_union_solidaires_manifestation.pdf
- **[S11b]** Gendarmerie, programme de renouvellement des véhicules de maintien de l'ordre (« bleus à la sérigraphie jaune ») **(résumé ; page bloquée à la lecture)** — https://www.gendarmerie.interieur.gouv.fr/gendinfo/dossiers/des-nouveaux-vehicules-pour-la-gendarmerie/programme-vmo-le-plan-de-renouvellement-de-rames-de-maintien-de-l-ordre-de-la-gendarmerie-mobile
- **[S20]** Cours de code de la route, signaux sonores des véhicules d'intervention (435 Hz commun, 580 Hz police) **(lu partiellement)** — https://www.ornikar.com/code/cours/signalisation/sur-vehicule/signaux-sonores

### 9.3 Wikipédia (tous **lus**, au moins en partie)

- **[S7]** Grenade GM2L — https://fr.wikipedia.org/wiki/Grenade_GM2L
- **[S8]** Lanceur de balles de défense — https://fr.wikipedia.org/wiki/Lanceur_de_balles_de_défense
- **[S9]** Compagnies républicaines de sécurité — https://fr.wikipedia.org/wiki/Compagnies_républicaines_de_sécurité
- **[S10]** Compagnies Républicaines de Sécurité (anglais) — https://en.wikipedia.org/wiki/Compagnies_Républicaines_de_Sécurité
- **[S11]** Gendarmerie mobile — https://fr.wikipedia.org/wiki/Gendarmerie_mobile
- **[S13]** Véhicule blindé à roues de la Gendarmerie — https://fr.wikipedia.org/wiki/Véhicule_blindé_à_roues_de_la_Gendarmerie
- **[S18]** Canon à eau — https://fr.wikipedia.org/wiki/Canon_à_eau
- **[S19]** Avertisseur spécial de véhicule — https://fr.wikipedia.org/wiki/Avertisseur_spécial_de_véhicule
- **[S21]** Brigade de répression de l'action violente motorisée — https://fr.wikipedia.org/wiki/Brigade_de_répression_de_l'action_violente_motorisée
- **[S24]** Black bloc — https://fr.wikipedia.org/wiki/Black_bloc
- **[S25]** Street medic — https://fr.wikipedia.org/wiki/Street_medic
- **[S28]** Règlements d'urbanisme de Paris — https://fr.wikipedia.org/wiki/Règlements_d'urbanisme_de_Paris
- **[S29]** Haussmann's renovation of Paris (section « The Haussmann building ») — https://en.wikipedia.org/wiki/Haussmann%27s_renovation_of_Paris
- **[S30]** Fontaine Wallace — https://fr.wikipedia.org/wiki/Fontaine_Wallace
- **[S31]** Colonne Morris — https://fr.wikipedia.org/wiki/Colonne_Morris
- **[S32]** Édicule Guimard — https://fr.wikipedia.org/wiki/Édicule_Guimard
- **[S33]** Barrière Vauban — https://fr.wikipedia.org/wiki/Barrière_Vauban
- **[S38]** Écharpe tricolore — https://fr.wikipedia.org/wiki/Écharpe_tricolore
- **[S39]** Grades de la Police nationale française — https://fr.wikipedia.org/wiki/Grades_de_la_Police_nationale_française
- **[S40]** Forces aériennes de la Gendarmerie nationale — https://fr.wikipedia.org/wiki/Forces_aériennes_de_la_Gendarmerie_nationale
- **[S41]** Eurocopter EC135 — https://fr.wikipedia.org/wiki/Eurocopter_EC135
- **[S56]** Brigade de sapeurs-pompiers de Paris — https://fr.wikipedia.org/wiki/Brigade_de_sapeurs-pompiers_de_Paris
- **[S57]** Fiche d'un trail routier de 1 200 cm³ (empattement, hauteur de selle) — https://fr.wikipedia.org/wiki/Yamaha_XT1200Z_Super_Ténéré

---

## 10. Points incertains

### 10.1 Non trouvé (aucune source exploitable) — valeurs [E] à valider sur photos

1. **Casque CRS** : couleur exacte de la coque (bleu nuit ou noir), largeur et espacement des deux bandes jaunes, forme du bavolet, masse du modèle en dotation ; **aucune « bande de grade » sur le casque n'est documentée** — la convention du § 1.3 est une invention de lisibilité.
2. **Marquage dorsal du CRS** (texte, taille, présence du numéro de compagnie) et emplacement exact du code tactique (« 1C »).
3. **Dessin exact des galons** de chaque grade (nombre de chevrons / barrettes) : à relever dans l'arrêté du 9 décembre 2019 ou sur les planches officielles.
4. **Poids total** de l'équipement d'un CRS ; dimensions et masse du **bouclier rond** ; marquage des boucliers.
5. **Bâton de défense** : longueur et matériau du modèle en dotation ; **aérosols** : contenance, portée et durée de jet des modèles individuels et « grande capacité » ; **masque à gaz** : modèle et apparence.
6. **Grenade à 7 palets** : durée d'émission et surface couverte ; **GENL** et **assourdissante ASSD** : dimensions, niveau sonore, rayon d'effet.
7. **Engins lanceurs d'eau réellement en service** (CRS et préfecture de police) : capacité de cuve, débit, portée, équipage, livrée. Les chiffres du § 4.2 sont ceux d'un constructeur et d'ordres de grandeur étrangers.
8. **Lance-grenades du Centaure** : nombre physique de tubes (30 déduit de « 1 à 30 tirs en série »), cadence entre deux tirs, type de grenade, temps de rechargement.
9. **Fourgon de CRS, car, véhicule de commandement, fourgon cellulaire** : cotes exactes, description de la sérigraphie (ancienne et « nouvelles couleurs 2021 »), grilles de protection.
10. **Gyrophares** : fréquence d'éclats réglementaire ; durée exacte du silence du « trois tons ».
11. **Drones de la préfecture de police** : modèles, gabarit, autonomie, altitude d'emploi ; contenu exact des interdictions légales (son, reconnaissance faciale) non relu.
12. **Hélicoptère** : altitude et durée des vols de surveillance au-dessus de Paris.
13. **Cortège syndical** (ballons, camions sono, chasubles, banderole de tête, service d'ordre) : description par observation générale, sans source chiffrée ; **parapluies** du bloc noir : non mentionnés par les sources lues.
14. **Mobilier urbain** : hauteur et diamètre de la colonne Morris, dimensions du kiosque de presse actuel, du banc, des candélabres, du potelet parisien, des grilles d'arbre, de la corbeille de rue, des bacs roulants, des feux tricolores ; dimensions réelles des **pavés** parisiens.
15. **Véhicules des pompiers de Paris et du SAMU** : cotes et sérigraphies.

### 10.2 Sources divergentes ou fragiles

- **Hauteur du Centaure** : 3,82 m (dossier de presse) contre ≈ 3,05–3,3 m (comparaison de la Cour des comptes, fiche du véhicule de base) → traité au § 4.3.
- **Répartition du parc Centaure** : « un tiers / un tiers / un tiers » (gendarmerie) contre 56 en métropole et 34 outre-mer (Cour des comptes).
- **Nombre de compagnies de CRS** : 60 ou 64 selon que l'on compte les unités créées récemment [S2] ; effectif ≈ 11 150.
- **Statut des BRAV-M** : « pas des unités permanentes », binômes constitués au jour le jour selon la Cour des comptes [S2] ; une compagnie permanente dotée d'un service motocycliste propre selon [S21][S22b].
- **Tenue du gendarme mobile** : « noire » pour une source anglophone, « bleu foncé / bleu gendarme » dans l'historique du musée.
- **Lanceur 56 mm** : la brochure [S6] mélange les fiches (elle place les cotes du LBD sous le titre du lanceur de grenades) ; les valeurs retenues sont celles de [S5]. Selon [S5] (2017), ce lanceur n'était autorisé qu'avec deux modèles de grenades, dont l'un est aujourd'hui retiré : la liste actuelle des munitions autorisées n'a pas été retrouvée.
- **Lanceur multi-coups 40 mm** : [S5] inverse manifestement les longueurs crosse pliée / dépliée.
- **Grenade à 6 palets** : durée (30 s) et surface (800 m²) proviennent de documents de 2012 reprenant la fiche du fabricant, non d'une source officielle.
- **Sirènes** : fréquences tirées d'un tableau reconstitué par un outil de lecture à partir de l'article [S19] ; l'arrêté du 3 novembre 1987 lui-même n'a pas été lu.
- **Port de l'écharpe** par le commissaire (ceinture ou bandoulière) ; couleur orange du brassard des policiers en civil : usage courant non sourcé ici.
- **Statut des munitions** : la réglementation évolue vite (retraits de 2020-2021, nouveaux marchés de 2023-2024) ; refaire une vérification avant toute mention « réaliste à la date de sortie ».
- Plusieurs faits ne sont connus que par des **résumés de moteur de recherche** (mention « résumé » en section 9) : pages officielles bloquées à la lecture (police nationale, gendarmerie « Gendinfo ») ou non ouvertes.
