
## journee commandant republique passenger graine 7
config : rôle commandant grade commandant poste commandant_unite variante terrain journée true ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur scope:tout à pied | obj: Embarquez : véhicule de commandement MISTRAL
  monte à t=40 dans vl_commandement passenger
  t=41 j:embarquement cv:route scope:tout à bord | obj: À bord : la colonne va partir
  t=128 j:route cv:route scope:tout à bord | obj: En route en colonne : Rue du Temple
  t=436 j:route cv:stationnement scope:tout à bord | obj: En route en colonne : Rue du Temple
  t=987 j:sur_place cv:debarquement scope:tout à pied | obj: 
ARRIVÉE à t=987 (sur_place)
à l'arrivée : à pied ; j:sur_place cv:debarquement scope:tout à pied ; unités : MISTRAL[debarquer >debarquer] bord 74/87 bouge 0 cv:debarquement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 18/87 bouge 44 cv:debarquement | MISTRAL[suivre >suivre] bord 18/87 bouge 57 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 0.5s | MISTRAL 2[embarquer >embarquer] bord 13/19 bouge 6 cv:route | MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 7 cv:route | j:sur_place cv:debarquement scope:tout à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL avance en formation | 0.5s | MISTRAL[avancer >avancer] bord 34/87 bouge 28 cv:debarquement | MISTRAL[avancer >avancer] bord 34/87 bouge 54 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 0.5s | MISTRAL 2[refoulement >refoulement] bord 19/19 bouge 19 cv:route | MISTRAL 2[refoulement >refoulement] bord 19/19 bouge 19 cv:route | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[embarquer >embarquer] bord 53/87 bouge 45 cv:debarquement | MISTRAL[embarquer >embarquer] bord 54/87 bouge 45 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL tient une ligne | 0.5s | MISTRAL[ligne >ligne] bord 60/87 bouge 41 cv:debarquement | MISTRAL[ligne >ligne] bord 63/87 bouge 38 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et barre la rue des Filles du Calvaire d’une façade à l’autre. Personne ne passe. | 0.5s | MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 19 cv:route | MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 14 cv:route | j:sur_place cv:debarquement scope:tout à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL interpelle | 0.5s | MISTRAL[ligne >ligne/embarquer] bord 71/87 bouge 30 cv:debarquement | MISTRAL[ligne >ligne/embarquer] bord 79/87 bouge 22 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · BRAV-M FAUCON 1] Ce qui va se passer : La BRAV-M FAUCON 1 part en véhicules (~1 min) et interpelle l’auteur des faits constatés près de la foule ; s’il prend la fuite, l’interpellation est ab | 1.0s | FAUCON 1[interpeller >libre] bord 12/12 bouge 12 | FAUCON 1[interpeller >libre] bord 12/12 bouge 12 | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 100 | carte:encercler | oui | [Encercler (nasse) · 10 unités choisies par le jeu — 6 rues resteront ouvertes] Ce qui va se passer : Les 10 unités choisies par le jeu tiennent chacune une rue autour de la foule ; 6 rues restent ouvertes faute d’unités | 0.5s | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 7 cv:route ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-2[couper_circulation] bord 2/2 bouge 2 ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 19 cv:route ; MISTRAL 3[embarquer >embarquer] bord 19/19 bouge 0 cv:route ; MISTRAL 4[embarquer >embarquer] bord 14/19 bouge 0 cv:route ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-6[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 2 | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 7 cv:route ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-2[couper_circulation] bord 2/2 bouge 0 ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 19 cv:route ; MISTRAL 3[embarquer >embarquer] bord 19/19 bouge 0 cv:route ; MISTRAL 4[embarquer >embarquer] bord 14/19 bouge 0 cv:route ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-6[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 0 | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 2 |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL tient sa position | 0.5s | MISTRAL[tenir >tenir] bord 82/87 bouge 37 cv:debarquement | MISTRAL[tenir >tenir] bord 82/87 bouge 35 cv:debarquement | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL fait un bond en avant | 0.5s | MISTRAL[bond_offensif >bond_offensif] bord 82/87 bouge 37 cv:en_place | MISTRAL[bond_offensif >bond_offensif] bord 82/87 bouge 31 cv:en_place | j:sur_place cv:debarquement scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL se replie | 0.5s | MISTRAL[repli >repli] bord 82/87 bouge 29 cv:en_place | MISTRAL[repli >repli] bord 82/87 bouge 26 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL attend | 0.5s | MISTRAL[cesser >cesser] bord 82/87 bouge 26 cv:en_place | MISTRAL[cesser >cesser] bord 84/87 bouge 24 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL sans ordre | 0.5s | MISTRAL[libre >libre] bord 84/87 bouge 30 cv:en_place | MISTRAL[libre >libre] bord 87/87 bouge 23 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL se protège (tortue) | 0.5s | MISTRAL[tortue >tortue/debarquer] bord 78/87 bouge 35 cv:en_place | MISTRAL[tortue >tortue/debarquer] bord 71/87 bouge 44 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue/debarquer] bord 71/87 bouge 35 cv:en_place | MISTRAL[tortue >tortue/debarquer] bord 71/87 bouge 43 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue/debarquer] bord 71/87 bouge 38 cv:en_place | MISTRAL[tortue >tortue/debarquer] bord 71/87 bouge 37 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL[tortue >tortue/couper_circulation] bord 71/87 bouge 16 cv:en_place | MISTRAL[tortue >tortue/couper_circulation] bord 71/87 bouge 32 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2,MISTRAL 3,MISTRAL 4 |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 18/87 bouge 42 cv:en_place | MISTRAL[suivre >suivre] bord 18/87 bouge 44 cv:en_place | j:sur_place cv:en_place scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 3,MISTRAL 4 |

unités en fin :
    MISTRAL[suivre >suivre] bord 18/87 bouge 44 cv:en_place
    FAUCON 1[interpeller >couper_circulation] bord 12/12 bouge 12
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL: MISTRAL 4 ICI MISTRAL. Embarquez, mouvement en véhicules, deux tons, sur Rue de Crussol. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je romps le contact, repli, rue Béranger. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Bond offensif, UN-CINQ mètres, en avant, puis halte et réalignement. PARLEZ.
    FAUCON 1-1: ICI FAUCON UN-UN. REÇU, je barre la rue, Rue de Saintonge. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Tenez la position. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Barrage en place, face nord-ouest, SIX à pied. PARLEZ.
    MISTRAL 3: ICI MISTRAL TROIS. REÇU, j’embarque. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Bond effectué, ligne réalignée. PARLEZ.
    FAUCON 1-4: ICI FAUCON UN-QUATRE. REÇU, je barre la rue, Rue Amelot. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Rompez le contact, repli par échelons, rue Béranger. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Halte à l’action en cours. PARLEZ.
    FAUCON 1-6: ICI FAUCON UN-SIX. REÇU, je barre la rue, rue Amelot. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL 2: ICI MISTRAL DEUX. REÇU, j’embarque. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL 2: ICI MISTRAL DEUX. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 2: MISTRAL ICI MISTRAL DEUX. Débarqué, en ligne face sud, UN-SIX à pied. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Tortue formée, boucliers hauts. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Me suivre à pied : en formation derrière moi. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je suis votre mouvement. TERMINÉ.

## stationnement journee commandant republique passenger graine 7
config : rôle commandant grade commandant poste commandant_unite variante terrain journée true ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur scope:tout à pied | obj: Embarquez : véhicule de commandement MISTRAL
  monte à t=40 dans vl_commandement passenger
  t=41 j:embarquement cv:route scope:tout à bord | obj: À bord : la colonne va partir
  t=128 j:route cv:route scope:tout à bord | obj: En route en colonne : Rue du Temple
  t=436 j:route cv:stationnement scope:tout à bord | obj: En route en colonne : Rue du Temple
ARRÊT DE LA COLONNE (stationnement) à t=436 : le joueur voit la manif et descend
à l'arrivée : à bord ; j:route cv:stationnement scope:tout à bord ; unités : MISTRAL[embarquer >embarquer] bord 87/87 bouge 0 cv:stationnement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 18/87 bouge 20 cv:stationnement | MISTRAL[suivre >suivre] bord 18/87 bouge 38 cv:stationnement | j:route cv:stationnement scope:tout à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 0.5s | MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 5 cv:route | MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 5 cv:route | j:route cv:stationnement scope:tout à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL avance en formation | 0.5s | MISTRAL[avancer >avancer] bord 34/87 bouge 43 cv:stationnement | MISTRAL[avancer >avancer] bord 34/87 bouge 49 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.5s | MISTRAL 1[refoulement >refoulement] bord 3/19 bouge 4 | MISTRAL 1[refoulement >refoulement] bord 3/19 bouge 14 | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[embarquer >embarquer] bord 50/87 bouge 49 cv:stationnement | MISTRAL[embarquer >embarquer] bord 66/87 bouge 36 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL tient une ligne | 0.5s | MISTRAL[ligne >ligne] bord 77/87 bouge 18 cv:stationnement | MISTRAL[ligne >ligne] bord 77/87 bouge 33 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part en véhicules (~1 min) et barre la rue Béranger d’une façade à l’autre. Personne ne passe. | 0.5s | MISTRAL 3[embarquer >embarquer] bord 9/19 bouge 9 cv:route | MISTRAL 3[embarquer >embarquer] bord 9/19 bouge 10 cv:route | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2 |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL interpelle | 0.5s | MISTRAL[ligne >ligne/embarquer] bord 78/87 bouge 16 cv:stationnement | MISTRAL[ligne >ligne/embarquer] bord 80/87 bouge 15 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 3 |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · BRAV-M FAUCON 1] Ce qui va se passer : La BRAV-M FAUCON 1 part en véhicules (~1 min) et va constater près de la foule ; sans fait constaté, personne n’est interpellé. | 1.0s | FAUCON 1[interpeller >libre] bord 12/12 bouge 12 | FAUCON 1[interpeller >libre] bord 12/12 bouge 12 | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 3 |
| 100 | carte:encercler | oui | [Encercler (nasse) · 10 unités choisies par le jeu — 12 rues resteront ouvertes] Ce qui va se passer : Les 10 unités choisies par le jeu tiennent chacune une rue autour de la foule ; 12 rues restent ouvertes faute d’unit | 0.5s | FAUCON 1-2[couper_circulation] bord 2/2 bouge 2 ; MISTRAL 1[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 2 ; MISTRAL 3[couper_circulation >couper_circulation] bord 12/19 bouge 8 cv:route ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 7 cv:route ; MISTRAL 4[embarquer >embarquer] bord 19/19 bouge 7 cv:route ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-6[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 2 | FAUCON 1-2[couper_circulation] bord 2/2 bouge 2 ; MISTRAL 1[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 2 ; MISTRAL 3[couper_circulation >couper_circulation] bord 13/19 bouge 7 cv:route ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 7 cv:route ; MISTRAL 4[embarquer >embarquer] bord 19/19 bouge 19 cv:route ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-6[couper_circulation] bord 2/2 bouge 2 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 2 | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 3 |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL tient sa position | 0.5s | MISTRAL[tenir >tenir] bord 81/87 bouge 33 cv:stationnement | MISTRAL[tenir >tenir] bord 81/87 bouge 40 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL fait un bond en avant | 0.5s | MISTRAL[bond_offensif >bond_offensif] bord 81/87 bouge 44 cv:stationnement | MISTRAL[bond_offensif >bond_offensif] bord 81/87 bouge 49 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL se replie | 0.5s | MISTRAL[repli >repli] bord 81/87 bouge 49 cv:stationnement | MISTRAL[repli >repli] bord 81/87 bouge 48 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL attend | 0.5s | MISTRAL[cesser >cesser] bord 81/87 bouge 44 cv:stationnement | MISTRAL[cesser >cesser] bord 81/87 bouge 40 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL sans ordre | 0.5s | MISTRAL[libre >libre] bord 81/87 bouge 49 cv:stationnement | MISTRAL[libre >libre] bord 81/87 bouge 42 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL se protège (tortue) | 0.5s | MISTRAL[tortue >tortue] bord 81/87 bouge 35 cv:stationnement | MISTRAL[tortue >tortue] bord 81/87 bouge 26 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 81/87 bouge 21 cv:stationnement | MISTRAL[tortue >tortue] bord 81/87 bouge 21 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 81/87 bouge 26 cv:stationnement | MISTRAL[tortue >tortue] bord 81/87 bouge 40 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL[tortue >tortue] bord 81/87 bouge 40 cv:stationnement | MISTRAL[tortue >tortue] bord 81/87 bouge 35 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[debarquer >debarquer] bord 22/87 bouge 48 cv:stationnement | MISTRAL[debarquer >debarquer] bord 21/87 bouge 48 cv:stationnement | j:route cv:stationnement scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4 |

unités en fin :
    MISTRAL[debarquer >debarquer] bord 21/87 bouge 48 cv:stationnement
    FAUCON 1[colonne >colonne] bord 6/12 bouge 6
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
radio (fin) :
    FAUCON 1-6: ICI FAUCON UN-SIX. REÇU, je barre la rue, Rue Amelot. TERMINÉ.
    MISTRAL 2: ICI MISTRAL DEUX. REÇU, j’embarque. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, je romps le contact, repli, rue Béranger. TERMINÉ.
    MISTRAL: FAUCON 1-1 ICI MISTRAL. Barrez la rue, Rue Béranger, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.
    FAUCON 1-4: ICI FAUCON UN-QUATRE. REÇU, je barre la rue, boulevard Voltaire. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Tenez la position. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Barrage en place, face nord-ouest, SEPT à pied. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je reprends ma mission. TERMINÉ.
    FAUCON 1-2: ICI FAUCON UN-DEUX. REÇU, je barre la rue, Boulevard du Temple. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Rompez le contact, repli par échelons, rue Béranger. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL 1: MISTRAL ICI MISTRAL UN. Largeur insuffisante, DEUX-SIX mètres non tenus de part et d’autre, Boulevard du Temple, demande renfort. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Halte à l’action en cours. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL 3: MISTRAL ICI MISTRAL TROIS. Largeur insuffisante, UN-DEUX mètres non tenus de part et d’autre, Rue Béranger, demande renfort. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 3 BRAVO: MISTRAL TROIS ICI MISTRAL TROIS BRAVO. Dispositif de protection en place. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Tortue formée, boucliers hauts. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Me suivre à pied : en formation derrière moi. PARLEZ.
    FAUCON 1: ICI FAUCON UN. REÇU, en file, à pied, vers le point, boulevard du Temple. TERMINÉ.
    SAPEUR 1: CENTRAL ICI SAPEUR UN. Sur place, secteur avenue Claude Vellefaux. Intervention en cours. TERMINÉ.

##  journee chef_groupe republique passenger graine 7
config : rôle chef_groupe grade brigadier_chef poste chef_groupe variante  journée true ; scope unite « Chef de groupe — MISTRAL 1 ALFA » own=MISTRAL 1 ALFA follow=MISTRAL 1 ALFA
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/ia prop:0 scope:unite à pied | obj: Embarquez : fourgon de CRS MISTRAL 1 ALFA / Destination : Faire mouvement — Rue du Temple
  monte à t=33 dans fourgon_crs passenger
  t=34 j:embarquement cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: À bord : la colonne va partir / Destination : Faire mouvement — Rue du Temple
  t=118 j:route cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: En route en colonne : Rue du Temple
  t=534 j:route cv:stationnement cmd:arrivee/ia prop:0 scope:unite à bord | obj: En route en colonne : Rue du Temple
  t=554 j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied | obj: 
ARRIVÉE à t=554 (sur_place)
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied ; unités : MISTRAL[debarquer >debarquer] bord 74/87 bouge 13 cv:debarquement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#20413 à 112 m, pilote oui, état ok
scope à l'arrivée : unite « Chef de groupe — MISTRAL 1 ALFA » unités commandables 1 ; carte : 1 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 0.5s | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 5 | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 5 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.0s | MISTRAL 1 ALFA[embarquer] bord 1/6 bouge 5 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 1/6 bouge 5 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL 1 ALFA avance en formation | 1.0s | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 4 cv:route+attendJoueur | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 4 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 40 | carte:disperser | oui | [Repousser la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.0s | MISTRAL 1 ALFA[refoulement] bord 2/6 bouge 3 cv:route+attendJoueur | MISTRAL 1 ALFA[refoulement] bord 3/6 bouge 2 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL 1 ALFA | 1.0s | MISTRAL 1 ALFA[embarquer] bord 3/6 bouge 2 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL 1 ALFA tient une ligne | >10s | MISTRAL 1 ALFA[ligne] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[ligne] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et barre la rue de Turenne d’une façade à l’autre. Personne ne passe. | >10s | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL 1 ALFA interpelle | >10s | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et interpelle l’auteur des faits constatés près de la foule ; s’il prend la fuite, l’interpell | >10s | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 100 | carte:encercler | oui | [Encercler (nasse) · 1 unité choisie par le jeu — 13 rues resteront ouvertes] Ce qui va se passer : Chaque rue autour de la foule est tenue par une unité ; 13 rues restent ouvertes faute d’unités : la nasse ne sera pas f | 9.0s | MISTRAL 1 ALFA[couper_circulation] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[couper_circulation] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL 1 ALFA tient sa position | 2.0s | MISTRAL 1 ALFA[tenir] bord 5/6 bouge 1 cv:route+attendJoueur | MISTRAL 1 ALFA[tenir] bord 5/6 bouge 1 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL 1 ALFA fait un bond en avant | 1.0s | MISTRAL 1 ALFA[bond_offensif] bord 5/6 bouge 1 cv:route+attendJoueur | MISTRAL 1 ALFA[bond_offensif] bord 5/6 bouge 1 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL 1 ALFA se replie | 1.0s | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL 1 ALFA attend | >10s | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL 1 ALFA sans ordre | >10s | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL 1 ALFA se protège (tortue) | >10s | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:conduite/ia prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:conduite/ia prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 0.5s | MISTRAL 1 ALFA[debarquer] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[debarquer] bord 5/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:conduite/ia prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[debarquer >debarquer/colonne/cesser] bord 22/87 bouge 35 cv:en_place
    FAUCON 1[colonne >libre] bord 12/12 bouge 0
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je barre la rue, Place de la République. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Bond offensif, UN-CINQ mètres, en avant, puis halte et réalignement. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Largeur insuffisante, UN mètres non tenus côté nord-est, Place de la République, demande renfort. PARLEZ.
    CENTRAL: ICI CENTRAL. Les secours sont partis pour le secteur rue de la Grange aux Belles. Délai estimé : DEUX minutes, préparez l’accès. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Tenez la position. PARLEZ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL UN ALFA. Barrières retirées : Place de la République. Circulation rétablie. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Barrage en place, face nord-ouest, DEUX à pied. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je tiens la position, rue du Temple. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Rompez le contact, repli par échelons, place de la République. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Halte à l’action en cours. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Unité éprouvée, en ligne sous pression depuis trop longtemps. SIX valides sur SIX. Demande relève sur place. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Bond effectué, ligne réalignée. PARLEZ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, rue du Temple. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je romps le contact, repli, place de la République. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Halte. Action interrompue, je tiens sur place. PARLEZ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, rue Léon Jouhaux. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: MISTRAL 1 ALFA, portez votre groupe Rue Jean-Pierre Timbaud, en renfort du barrage. Rendez compte en place.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL 3 ALFA: CENTRAL ICI MISTRAL TROIS ALFA. Conducteur bloqué par la foule, secteur boulevard du Temple. Il ne peut ni avancer ni reculer, unité à désigner. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Tortue formée, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, tortue, boucliers hauts. TERMINÉ.

##  journee chef_section bastille passenger graine 5
config : rôle chef_groupe grade capitaine poste chef_section variante  journée true ; scope unite « Chef de groupe — MISTRAL 1 » own=MISTRAL 1 follow=MISTRAL 1
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/ia prop:0 scope:unite à pied | obj: Embarquez : fourgon de CRS MISTRAL 1 CHARLIE / Destination : Faire mouvement — Boulevard Henri IV
  monte à t=28 dans fourgon_crs passenger
  t=29 j:embarquement cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: À bord : la colonne va partir / Destination : Faire mouvement — Boulevard Henri IV
  t=128 j:route cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: En route en colonne : Boulevard Henri IV
  t=361 j:route cv:stationnement cmd:arrivee/ia prop:0 scope:unite à bord | obj: En route en colonne : Boulevard Henri IV
  t=612 j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied | obj: 
ARRIVÉE à t=612 (sur_place)
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied ; unités : MISTRAL[debarquer >libre/debarquer] bord 73/87 bouge 0 cv:debarquement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#15140 à 145 m, pilote oui, état ok
scope à l'arrivée : unite « Chef de groupe — MISTRAL 1 » unités commandables 4 ; carte : 4 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 | 0.5s | MISTRAL 1[debarquer >debarquer] bord 4/18 bouge 0 | MISTRAL 1[suivre >suivre] bord 3/18 bouge 15 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.0s | MISTRAL 1[avancer >avancer] bord 3/18 bouge 15 | MISTRAL 1[avancer >avancer] bord 3/18 bouge 14 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL 1 avance en formation | 1.0s | MISTRAL 1[avancer >avancer] bord 3/18 bouge 15 | MISTRAL 1[avancer >avancer] bord 3/18 bouge 15 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.0s | MISTRAL 1[refoulement >refoulement] bord 3/18 bouge 7 | MISTRAL 1[refoulement >refoulement] bord 3/18 bouge 4 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL 1 | 1.0s | MISTRAL 1[embarquer >embarquer] bord 3/18 bouge 15 | MISTRAL 1[embarquer >embarquer] bord 3/18 bouge 15 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL 1 tient une ligne | 1.0s | MISTRAL 1[ligne >ligne] bord 4/18 bouge 13 | MISTRAL 1[ligne >ligne] bord 4/18 bouge 14 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et barre le boulevard Richard-Lenoir d’une façade à l’autre. Personne ne passe. | 1.0s | MISTRAL 1[embarquer >embarquer] bord 6/18 bouge 12 cv:route+attendJoueur | MISTRAL 1[embarquer >embarquer] bord 12/18 bouge 6 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL 1 interpelle | 0.5s | MISTRAL 1[embarquer >embarquer] bord 17/18 bouge 1 cv:route+attendJoueur | MISTRAL 1[embarquer >embarquer] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et interpelle l’auteur des faits constatés près de la foule ; s’il prend la fuite, l’interpell | >10s | MISTRAL 1 ALFA[embarquer] bord 7/7 bouge 0 | MISTRAL 1 ALFA[embarquer] bord 7/7 bouge 0 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 100 | carte:encercler | oui | [Encercler (nasse) · 1 unité choisie par le jeu — 18 rues resteront ouvertes] Ce qui va se passer : Chaque rue autour de la foule est tenue par une unité ; 18 rues restent ouvertes faute d’unités : la nasse ne sera pas f | >10s | MISTRAL 1[couper_circulation >couper_circulation] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[couper_circulation >couper_circulation] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL 1 tient sa position | >10s | MISTRAL 1[tenir >tenir] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[tenir >tenir] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL 1 fait un bond en avant | >10s | MISTRAL 1[bond_offensif >ligne/bond_offensif] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[bond_offensif >ligne/bond_offensif] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:arrivee/ia prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL 1 se replie | >10s | MISTRAL 1[repli >repli] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[repli >repli] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL 1 attend | >10s | MISTRAL 1[cesser >cesser] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[cesser >cesser] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL 1 sans ordre | >10s | MISTRAL 1[libre >libre] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[libre >libre] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL 1 se protège (tortue) | >10s | MISTRAL 1[tortue >tortue] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[tortue >tortue] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL 1[tortue >tortue] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[tortue >tortue/proteger] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL 1[tortue >tortue/proteger] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[tortue >tortue/proteger] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL 1[tortue >tortue/proteger] bord 18/18 bouge 0 cv:route+attendJoueur | MISTRAL 1[tortue >tortue/proteger] bord 18/18 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 | 0.5s | MISTRAL 1[debarquer >debarquer] bord 8/18 bouge 10 cv:route+attendJoueur | MISTRAL 1[debarquer >debarquer] bord 14/18 bouge 2 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[debarquer >debarquer/proteger/cesser] bord 26/87 bouge 36 cv:en_place
    FAUCON 1[colonne >libre] bord 12/12 bouge 0
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ.
    CENTRAL: ICI CENTRAL. Sapeurs-pompiers en route vers rue Malher. Délai : UNE minute. Préparez l’accès. TERMINÉ.
    MISTRAL: MISTRAL 1 CHARLIE, portez votre groupe Place de la Bastille (dégradations). Rendez compte en place.
    MISTRAL 1: ICI MISTRAL UN. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL 1: MISTRAL ICI MISTRAL UN. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Rompez le contact, repli par échelons, place de la Bastille. PARLEZ.
    MISTRAL 1: ICI MISTRAL UN. REÇU, je romps le contact, repli, place de la Bastille. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, boulevard Beaumarchais. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1: MISTRAL ICI MISTRAL UN. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Halte à l’action en cours. PARLEZ.
    MISTRAL 1: ICI MISTRAL UN. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL 1: ICI MISTRAL UN. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL 1: MISTRAL ICI MISTRAL UN. Tortue formée, boucliers hauts. PARLEZ.
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 1: ICI MISTRAL UN. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL 2 ALFA: CENTRAL ICI MISTRAL DEUX ALFA. Conducteur bloqué par la foule, secteur place de la Bastille. Il ne peut ni avancer ni reculer, unité à désigner. PARLEZ.
    MISTRAL 1: MISTRAL 1 CHARLIE, on n'attend plus que vous : embarquez !
    MISTRAL 2 BRAVO: ICI MISTRAL DEUX BRAVO. REÇU, ligne de barrage, boulevard Beaumarchais, face sud. TERMINÉ.
    MISTRAL: MISTRAL 1 CHARLIE, portez votre groupe Boulevard Beaumarchais. Rendez compte en place.
    MISTRAL 3 CHARLIE: ICI MISTRAL TROIS CHARLIE. REÇU, je suis votre mouvement. TERMINÉ.
    MISTRAL 4 BRAVO: CENTRAL ICI MISTRAL QUATRE BRAVO. Véhicule civil immobilisé au milieu de la foule, secteur place de la Bastille. Occupants à bord, dégagement à prévoir. PARLEZ.
    MISTRAL 1 BRAVO: ICI MISTRAL UN BRAVO. REÇU, ligne de barrage, rue Saint-Gilles, face est. TERMINÉ.
    MISTRAL 1: ICI MISTRAL UN. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL 1: MISTRAL 1 ICI MISTRAL 1. Me suivre à pied : en formation derrière moi. PARLEZ.

##  surplace commandant concorde none graine 21
config : rôle commandant grade commandant poste commandant_unite variante terrain journée false ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[libre >libre] bord 15/87 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied ; unités : MISTRAL[libre >libre] bord 15/87 bouge 7 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#9816 à 70 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 1.5s | MISTRAL[suivre >suivre] bord 15/87 bouge 54 | MISTRAL[suivre >suivre] bord 15/87 bouge 14 | j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part à pied (~2 min) et avance en formation jusqu’à la foule, boucliers levés. | 2.0s | MISTRAL 3[avancer >avancer] bord 3/19 bouge 0 | MISTRAL 3[avancer >avancer] bord 3/19 bouge 16 | j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL avance en formation | 1.5s | MISTRAL[avancer >avancer] bord 15/87 bouge 19 | MISTRAL[avancer >avancer] bord 15/87 bouge 53 | j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied |
| 30 | adjoint:accepter | oui | dispositif : Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dis | >10s |  |  | j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part à pied (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.5s | MISTRAL 3[refoulement >refoulement] bord 3/19 bouge 3 | MISTRAL 3[refoulement >refoulement] bord 3/19 bouge 15 | j:inactif cv:- cmd:conduite/adjoint prop:7 scope:tout à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL | 1.0s | MISTRAL[embarquer >embarquer] bord 17/87 bouge 65 | MISTRAL[embarquer >embarquer] bord 20/87 bouge 64 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL tient une ligne | 1.0s | MISTRAL[ligne >ligne] bord 22/87 bouge 64 | MISTRAL[ligne >ligne] bord 22/87 bouge 61 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part à pied (~1 min) et barre la terrasse de l'Orangerie d’une façade à l’autre. Personne ne passe. | 1.0s | MISTRAL 1[couper_circulation >couper_circulation] bord 6/19 bouge 13 | MISTRAL 1[couper_circulation >couper_circulation] bord 8/19 bouge 11 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL interpelle | 0.5s | MISTRAL[ligne >couper_circulation/ligne] bord 47/87 bouge 35 | MISTRAL[ligne >couper_circulation/ligne] bord 74/87 bouge 8 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · BRAV-M FAUCON 1] Ce qui va se passer : La BRAV-M FAUCON 1 part à pied (~2 min) et va constater près de la foule ; sans fait constaté, personne n’est interpellé. | 1.5s | FAUCON 1[colonne >colonne] bord 0/12 bouge 12 | FAUCON 1[colonne >colonne] bord 0/12 bouge 12 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 100 | carte:encercler | oui | [Encercler (nasse) · 9 unités choisies par le jeu — 24 rues resteront ouvertes] Ce qui va se passer : Les 9 unités choisies par le jeu tiennent chacune une rue autour de la foule ; 24 rues restent ouvertes faute d’unités | 1.0s | MISTRAL 4[couper_circulation >couper_circulation] bord 17/19 bouge 0 ; MISTRAL 3[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; MISTRAL 2[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; FAUCON 1-3[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-2[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-6[couper_circulation] bord 0/2 bouge 0 ; FAUCON 1-1[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-5[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-4[couper_circulation] bord 0/2 bouge 2 | MISTRAL 4[couper_circulation >couper_circulation] bord 17/19 bouge 0 ; MISTRAL 3[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; MISTRAL 2[couper_circulation >couper_circulation] bord 19/19 bouge 0 ; FAUCON 1-3[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-2[couper_circulation] bord 0/2 bouge 2 ; FAUCON 1-6[couper_circulation] bord 0/2 bouge 0 ; FAUCON 1-1[couper_circulation] bord 0/2 bouge 0 ; FAUCON 1-5[couper_circulation] bord 0/2 bouge 1 ; FAUCON 1-4[couper_circulation] bord 0/2 bouge 2 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL tient sa position | 0.5s | MISTRAL[tenir >tenir] bord 82/87 bouge 1 | MISTRAL[tenir >tenir] bord 82/87 bouge 1 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL fait un bond en avant | 2.0s | MISTRAL[bond_offensif >bond_offensif] bord 83/87 bouge 4 | MISTRAL[bond_offensif >bond_offensif] bord 83/87 bouge 4 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 130 | carte:secours | oui | [Pompiers ici · personne] Ce qui va se passer : Les pompiers sont appelés sur ce point, près de Place de la Concorde : ils viennent éteindre ou secourir. | >10s |  |  | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL se replie | 2.0s | MISTRAL[repli >repli] bord 84/87 bouge 3 | MISTRAL[repli >repli] bord 84/87 bouge 3 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL attend | 2.0s | MISTRAL[cesser >cesser] bord 84/87 bouge 3 | MISTRAL[cesser >cesser] bord 84/87 bouge 3 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL sans ordre | 2.0s | MISTRAL[libre >libre] bord 84/87 bouge 3 | MISTRAL[libre >libre] bord 84/87 bouge 3 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL se protège (tortue) | 2.5s | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | MISTRAL[tortue >tortue] bord 84/87 bouge 0 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 15/87 bouge 64 | MISTRAL[suivre >suivre] bord 15/87 bouge 72 | j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied |

unités en fin :
    MISTRAL[suivre >suivre] bord 15/87 bouge 72
    FAUCON 1[colonne >colonne] bord 0/12 bouge 6
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL: ICI MISTRAL. REÇU, je tiens la position, place de la Concorde. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Bond offensif, DEUX-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ.
    CENTRAL: ICI CENTRAL. Les secours sont partis pour le secteur place de la Concorde. Délai estimé : DEUX minutes, préparez l’accès. TERMINÉ.
    FAUCON 1-2: ICI FAUCON UN-DEUX. REÇU, je barre la rue, Place de la Concorde. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Interpellez l’objectif désigné, place de la Concorde, sur fait constaté. PARLEZ.
    MISTRAL 2: MISTRAL ICI MISTRAL DEUX. Largeur insuffisante, DEUX-ZÉRO mètres non tenus de part et d’autre, Place de la Concorde, demande renfort. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Demande les sapeurs-pompiers sur place, place de la Concorde. Je sécurise l’accès. PARLEZ.
    MISTRAL: FAUCON 1 ICI MISTRAL. Interpellez l’objectif désigné, place de la Concorde, sur fait constaté. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je romps le contact, repli, place de la Concorde. TERMINÉ.
    MISTRAL: MISTRAL 4 ICI MISTRAL. Barrez la rue, Place de la Concorde, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL: MISTRAL 3 ICI MISTRAL. Barrez la rue, Place de la Concorde, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.
    MISTRAL 3: MISTRAL ICI MISTRAL TROIS. Largeur insuffisante, UN-TROIS mètres non tenus de part et d’autre, Place de la Concorde, demande renfort. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Rompez le contact, repli par échelons, place de la Concorde. PARLEZ.
    MISTRAL 4: MISTRAL ICI MISTRAL QUATRE. Largeur insuffisante, SEPT mètres non tenus de part et d’autre, Place de la Concorde, demande renfort. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Halte à l’action en cours. PARLEZ.
    FAUCON 1-1: MISTRAL ICI FAUCON UN-UN. Largeur insuffisante, UN mètres non tenus côté nord-est, Place de la Concorde, demande renfort. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Reprenez votre mission, initiative laissée. PARLEZ.
    FAUCON 1-4: MISTRAL ICI FAUCON UN-QUATRE. Rue barrée, Place de la Concorde : personne ne passe, barrage en place face sud-ouest. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Formez la tortue, boucliers hauts. PARLEZ.

##  journee bravm_chef republique none graine 7
config : rôle bravm grade brigadier_chef poste pilote_moto variante  journée true ; scope unite « Chef de groupe — BRAV-M 1 » own=BRAV-M 1 follow=BRAV-M 1
unités au départ : MISTRAL[libre >libre] bord 15/88 bouge 0 ; FAUCON 1[libre >libre] bord 12/12 bouge 0 ; BRAV-M 1[suivre] bord 0/5 bouge 0
  t=1 j:route cv:- cmd:- prop:0 scope:unite à pied | obj: En selle, en tête de la BRAV-M : Rue du Temple
PAS D'ARRIVÉE après 1500 s : j:route cv:- cmd:- prop:0 scope:unite à pied
à l'arrivée : à pied ; j:route cv:- cmd:- prop:0 scope:unite à pied ; unités : MISTRAL[debarquer >colonne/repli] bord 18/88 bouge 65 cv:en_place ; FAUCON 1[repli >libre] bord 12/12 bouge 10 ; BRAV-M 1[suivre] bord 0/5 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#20413 à 1725 m, pilote oui, état ok
scope à l'arrivée : unite « Chef de groupe — BRAV-M 1 » unités commandables 1 ; carte : 1 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | 2.0s | BRAV-M 1[suivre] bord 0/5 bouge 1 | BRAV-M 1[suivre] bord 0/5 bouge 3 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 part en véhicules (~3 min) et avance en formation jusqu’à la foule, boucliers levés. | 2.0s | BRAV-M 1[avancer] bord 0/5 bouge 0 | BRAV-M 1[avancer] bord 0/5 bouge 2 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : BRAV-M 1 avance en formation | 2.0s | BRAV-M 1[avancer] bord 0/5 bouge 1 | BRAV-M 1[avancer] bord 0/5 bouge 5 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 40 | carte:disperser | NON | (aucun repère proposé pour cette intention) | - |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : BRAV-M 1 | 1.5s | BRAV-M 1[embarquer] bord 3/5 bouge 2 | BRAV-M 1[embarquer] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : BRAV-M 1 tient une ligne | >10s | BRAV-M 1[ligne] bord 5/5 bouge 0 | BRAV-M 1[ligne] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 barre le boulevard du Palais d’une façade à l’autre. Personne ne passe. | >10s | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | NON | visez quelqu’un (secteur grisé) | - |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 90 | carte:interpeller | NON | (aucun repère proposé pour cette intention) | - |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 100 | carte:encercler | NON | (aucun repère proposé pour cette intention) | - |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : BRAV-M 1 tient sa position | >10s | BRAV-M 1[tenir] bord 5/5 bouge 0 | BRAV-M 1[tenir] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : BRAV-M 1 fait un bond en avant | >10s | BRAV-M 1[bond_offensif] bord 5/5 bouge 0 | BRAV-M 1[bond_offensif] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : BRAV-M 1 se replie | >10s | BRAV-M 1[repli] bord 5/5 bouge 0 | BRAV-M 1[repli] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : BRAV-M 1 attend | >10s | BRAV-M 1[cesser] bord 5/5 bouge 0 | BRAV-M 1[cesser] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : BRAV-M 1 sans ordre | >10s | BRAV-M 1[libre] bord 5/5 bouge 0 | BRAV-M 1[libre] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : BRAV-M 1 se protège (tortue) | >10s | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:route cv:- cmd:- prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | 2.5s | BRAV-M 1[suivre] bord 0/5 bouge 3 | BRAV-M 1[suivre] bord 0/5 bouge 4 | j:route cv:- cmd:- prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[embarquer >embarquer] bord 48/88 bouge 42 cv:rembarquement
    FAUCON 1[repli >libre] bord 12/12 bouge 4
    BRAV-M 1[suivre] bord 0/5 bouge 4
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL: ICI MISTRAL. REÇU, j’embarque. TERMINÉ.
    FAUCON 1: MISTRAL ICI FAUCON UN. En position, SIX motos. PARLEZ.
    FAUCON 1: CENTRAL ICI FAUCON UN. Fermeture effectuée : Boulevard du Palais. Véhicule en travers, déviation en place. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je tiens la position, boulevard du Palais. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Rue barrée, Boulevard du Palais : personne ne passe, barrage en place face sud-ouest. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Bond offensif, DEUX-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ.
    CENTRAL: ICI CENTRAL. Sapeurs-pompiers en route vers boulevard Bourdon. Délai : UNE minute. Préparez l’accès. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Largeur insuffisante, TROIS-TROIS mètres non tenus de part et d’autre, Boulevard du Palais, demande renfort. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je romps le contact, repli, boulevard du Palais. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Tenez la position. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, halte à l’action en cours. TERMINÉ.
    FAUCON 1: CENTRAL ICI FAUCON UN. Barrières retirées : Boulevard du Palais. Circulation rétablie. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je reprends ma mission. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Barrage en place, Boulevard du Palais, face nord-est, UN à pied. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, tortue, boucliers hauts. TERMINÉ.
    FAUCON 1: CENTRAL ICI FAUCON UN. Circulation coupée : Boulevard du Palais. Barrières posées, déviation en place. PARLEZ.
    FAUCON 1: CENTRAL ICI FAUCON UN. Voie rouverte : Boulevard du Palais. Les véhicules passent de nouveau. PARLEZ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Bond effectué, ligne réalignée. PARLEZ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Rompez le contact, repli par échelons, boulevard du Palais. PARLEZ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Halte à l’action en cours. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je débarque et je me mets en place. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Halte. Action interrompue, je tiens sur place. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je suis votre mouvement. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Reprenez votre mission, initiative laissée. PARLEZ.

##  journee commandant concorde driver graine 21
config : rôle commandant grade commandant poste commandant_unite variante terrain journée true ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: Embarquez : véhicule de commandement MISTRAL
  monte à t=40 dans vl_commandement driver
  t=41 j:embarquement cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: Suivez la colonne : Place de la Concorde
  t=47 j:route cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Place de la Concorde
  t=137 j:route cv:route+attendPilote cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Place de la Concorde
  t=139 j:route cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Place de la Concorde
  t=433 j:route cv:stationnement cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: En route en colonne : Place de la Concorde
  t=823 j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: 
ARRIVÉE à t=823 (sur_place)
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied ; unités : MISTRAL[debarquer >debarquer] bord 21/87 bouge 4 cv:debarquement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75E[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#17608 à 2151 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 16/87 bouge 69 cv:debarquement | MISTRAL[suivre >suivre] bord 16/87 bouge 70 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.0s | MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route | MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL avance en formation | 1.0s | MISTRAL[avancer >avancer] bord 16/87 bouge 67 cv:debarquement | MISTRAL[avancer >avancer] bord 16/87 bouge 70 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.0s | MISTRAL 3[refoulement >refoulement] bord 3/19 bouge 16 cv:route | MISTRAL 3[refoulement >refoulement] bord 3/19 bouge 16 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL | 1.0s | MISTRAL[embarquer >embarquer] bord 16/87 bouge 70 cv:debarquement | MISTRAL[embarquer >embarquer] bord 16/87 bouge 70 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL tient une ligne | 1.0s | MISTRAL[ligne >ligne] bord 16/87 bouge 70 cv:debarquement | MISTRAL[ligne >ligne] bord 16/87 bouge 70 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 3] Ce qui va se passer : La section MISTRAL 3 part en véhicules (~1 min) et barre la terrasse de l'Orangerie d’une façade à l’autre. Personne ne passe. | 1.0s | MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route | MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL interpelle | 1.0s | MISTRAL[ligne >ligne/embarquer] bord 17/87 bouge 68 cv:debarquement | MISTRAL[ligne >ligne/embarquer] bord 21/87 bouge 64 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · BRAV-M FAUCON 1] Ce qui va se passer : La BRAV-M FAUCON 1 part à pied (~2 min) et interpelle l’auteur des faits constatés près de la foule ; s’il prend la fuite, l’interpellation est abandonn | >10s | FAUCON 1[interpeller >libre] bord 12/12 bouge 0 | FAUCON 1[interpeller >libre] bord 12/12 bouge 0 | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 100 | carte:encercler | oui | [Encercler (nasse) · 10 unités choisies par le jeu — 12 rues resteront ouvertes] Ce qui va se passer : Les 10 unités choisies par le jeu tiennent chacune une rue autour de la foule ; 12 rues restent ouvertes faute d’unit | 1.0s | FAUCON 1-6[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 0 ; MISTRAL 2[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 4[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 1[embarquer >embarquer] bord 3/19 bouge 17 cv:route ; FAUCON 1-2[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 0 | FAUCON 1-6[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-3[couper_circulation] bord 2/2 bouge 0 ; MISTRAL 2[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 4[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 3[embarquer >embarquer] bord 3/19 bouge 16 cv:route ; MISTRAL 1[embarquer >embarquer] bord 3/19 bouge 18 cv:route ; FAUCON 1-2[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-4[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-1[couper_circulation] bord 2/2 bouge 0 ; FAUCON 1-5[couper_circulation] bord 2/2 bouge 0 | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 3 |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL tient sa position | 0.5s | MISTRAL[tenir >tenir] bord 21/87 bouge 65 cv:debarquement | MISTRAL[tenir >tenir] bord 21/87 bouge 72 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL fait un bond en avant | 1.0s | MISTRAL[bond_offensif >bond_offensif] bord 21/87 bouge 71 cv:en_place | MISTRAL[bond_offensif >bond_offensif] bord 21/87 bouge 70 cv:en_place | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 130 | carte:secours | oui | [Envoyer les pompiers · personne] Ce qui va se passer : Les pompiers sont appelés sur l’incident : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL se replie | 1.0s | MISTRAL[repli >repli] bord 21/87 bouge 63 cv:en_place | MISTRAL[repli >repli] bord 21/87 bouge 63 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL attend | 1.0s | MISTRAL[cesser >cesser] bord 21/87 bouge 64 cv:en_place | MISTRAL[cesser >cesser] bord 21/87 bouge 63 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL sans ordre | 1.0s | MISTRAL[libre >libre] bord 21/87 bouge 64 cv:en_place | MISTRAL[libre >libre] bord 21/87 bouge 64 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL se protège (tortue) | 1.0s | MISTRAL[tortue >tortue] bord 21/87 bouge 63 cv:en_place | MISTRAL[tortue >tortue] bord 21/87 bouge 64 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 21/87 bouge 63 cv:en_place | MISTRAL[tortue >tortue] bord 21/87 bouge 63 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 21/87 bouge 64 cv:en_place | MISTRAL[tortue >tortue] bord 21/87 bouge 62 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL[tortue >tortue] bord 21/87 bouge 64 cv:en_place | MISTRAL[tortue >tortue] bord 21/87 bouge 63 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 2.5s | MISTRAL[suivre >suivre] bord 16/87 bouge 68 cv:en_place | MISTRAL[suivre >suivre] bord 16/87 bouge 65 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 2,MISTRAL 4,MISTRAL 3,MISTRAL 1 |

unités en fin :
    MISTRAL[suivre >suivre] bord 16/87 bouge 65 cv:en_place
    FAUCON 1[interpeller >couper_circulation] bord 12/12 bouge 6
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75E[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 4: ICI MISTRAL QUATRE. REÇU, j’embarque. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL: MISTRAL 4 ICI MISTRAL. Embarquez, mouvement en véhicules, deux tons, sur Place de la Concorde. PARLEZ.
    FAUCON 1-3: ICI FAUCON UN-TROIS. REÇU, je barre la rue, Place de la Concorde. TERMINÉ.
    CENTRAL: ICI CENTRAL. Sapeurs-pompiers en route vers place de la Concorde. Délai : UNE minute. Préparez l’accès. TERMINÉ.
    MISTRAL: MISTRAL 3 ICI MISTRAL. Embarquez, mouvement en véhicules, deux tons, sur Place de la Concorde. PARLEZ.
    FAUCON 1-5: ICI FAUCON UN-CINQ. REÇU, je barre la rue, place de la Concorde. TERMINÉ.
    MISTRAL: MISTRAL 1 ICI MISTRAL. Embarquez, mouvement en véhicules, deux tons, sur Place de la Concorde. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je romps le contact, repli, place de la Concorde. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Personne blessée à secourir, secteur place de la Concorde. Gravité : critique. Il faut une équipe pour l’extraire. PARLEZ.
    MISTRAL 3: ICI MISTRAL TROIS. REÇU, j’embarque. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Bond offensif, CINQ mètres, en avant, puis halte et réalignement. PARLEZ.
    FAUCON 1-1: ICI FAUCON UN-UN. REÇU, je barre la rue, place de la Concorde. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Blessé signalé, secteur place de la Concorde. Gravité : critique. Je demande une équipe d’extraction. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ.
    FAUCON 1-4: ICI FAUCON UN-QUATRE. REÇU, je barre la rue, Place de la Concorde. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Blessé à aller chercher, secteur place de la Concorde. Gravité : critique. Équipe à désigner pour l’extraire. PARLEZ.
    FAUCON 1-6: ICI FAUCON UN-SIX. REÇU, je barre la rue, place de la Concorde. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Personne inanimée, place de la Concorde. Équipe à désigner pour le prendre en charge. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Personne blessée à secourir, secteur place de la Concorde. Gravité : critique. Il faut une équipe pour l’extraire. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL: ICI MISTRAL. REÇU, je suis votre mouvement. TERMINÉ.
    SAPEUR 1: MISTRAL ICI SAPEUR UN. Nous sommes arrêtés à la limite de la zone, secteur place de la Concorde. Nous attendons la sécurisation avant d’avancer. PARLEZ.

##  surplace commandant concorde none graine 21 SEUL carte:envoyer
config : rôle commandant grade commandant poste commandant_unite variante terrain journée false ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[libre >libre] bord 15/87 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied ; unités : MISTRAL[libre >libre] bord 15/87 bouge 7 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#9816 à 70 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
carte:envoyer ok=true « [Y aller · Section MISTRAL 4] Ce qui va se passer : La section MISTRAL 4 part à pied (~2 min) et avance en formation jusqu’à la foule, boucliers levés. » 1er mouvement 1.5s
    +5s: MISTRAL 4[avancer >avancer] bord 3/19 bouge 13 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +20s: MISTRAL 4[avancer >avancer] bord 3/19 bouge 16 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +60s: MISTRAL 4[avancer >avancer] bord 3/19 bouge 16 (j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied)
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|


unités en fin :
    MISTRAL[libre >libre/avancer] bord 15/87 bouge 16
    FAUCON 1[libre >libre] bord 0/12 bouge 0
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 4 CHARLIE: ICI MISTRAL 4 CHARLIE. Je me place en protection de l’engin. TERMINÉ.
    MISTRAL ADJOINT: Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dispositif.
    MISTRAL 4 CHARLIE: ICI MISTRAL QUATRE CHARLIE. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL: MISTRAL 4 ICI MISTRAL. En avant, place de la Concorde, UN-CINQ-ZÉRO mètres, puis halte. PARLEZ.
    MISTRAL 4: ICI MISTRAL QUATRE. REÇU, en avant, UN-TROIS-ZÉRO mètres. TERMINÉ.
    MISTRAL 3 ALFA: ICI MISTRAL TROIS ALFA. REÇU, je suis votre mouvement. TERMINÉ.
    MISTRAL 3 ALFA: ICI MISTRAL TROIS ALFA. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL 4 BRAVO: MISTRAL ICI MISTRAL QUATRE BRAVO. Rien à signaler, secteur place de la Concorde. Nous restons en attente. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, place de la Concorde. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 3 ALFA: MISTRAL TROIS ICI MISTRAL TROIS ALFA. Dispositif de protection en place. PARLEZ.
    MISTRAL ADJOINT: Chef, automobiliste bloqué, pont de la Concorde, je propose d’y envoyer l’unité la plus proche.

##  surplace commandant concorde none graine 21 SEUL carte:interpeller
config : rôle commandant grade commandant poste commandant_unite variante terrain journée false ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[libre >libre] bord 15/87 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied ; unités : MISTRAL[libre >libre] bord 15/87 bouge 7 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#9816 à 70 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
carte:interpeller ok=true « [Interpeller dans la foule · BRAV-M FAUCON 1] Ce qui va se passer : La BRAV-M FAUCON 1 part à pied (~2 min) et va constater près de la foule ; sans fait constaté, personne n’est interpellé. » 1er mouvement 2.0s
    +5s: FAUCON 1[colonne >colonne] bord 0/12 bouge 12 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +20s: FAUCON 1[colonne >colonne] bord 0/12 bouge 10 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +60s: FAUCON 1[colonne >colonne] bord 0/12 bouge 12 (j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied)
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|


unités en fin :
    MISTRAL[libre >libre] bord 15/87 bouge 0
    FAUCON 1[colonne >colonne] bord 0/12 bouge 12
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 4 CHARLIE: ICI MISTRAL 4 CHARLIE. Je me place en protection de l’engin. TERMINÉ.
    MISTRAL ADJOINT: Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dispositif.
    MISTRAL 4 CHARLIE: ICI MISTRAL QUATRE CHARLIE. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL: FAUCON 1 ICI MISTRAL. Interpellez l’objectif désigné, place de la Concorde, sur fait constaté. PARLEZ.
    FAUCON 1: ICI FAUCON UN. REÇU, interception de l’objectif, place de la Concorde, pied à terre à distance. TERMINÉ.
    FAUCON 1: ICI FAUCON UN. REÇU, en file, à pied, vers le point, place de la Concorde. TERMINÉ.
    MISTRAL 4 CHARLIE: ICI MISTRAL QUATRE CHARLIE. REÇU, je suis votre mouvement. TERMINÉ.
    MISTRAL 1 BRAVO: MISTRAL ICI MISTRAL UN BRAVO. Vérification de l’effectif faite, secteur place de la Concorde. Nombre d’agents aptes : SEPT. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, place de la Concorde. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 4 CHARLIE: MISTRAL QUATRE ICI MISTRAL QUATRE CHARLIE. Dispositif de protection en place. PARLEZ.
    MISTRAL ADJOINT: Chef, automobiliste bloqué, pont de la Concorde, je propose d’y envoyer l’unité la plus proche.

##  surplace commandant concorde none graine 21 SEUL carte:bloquer
config : rôle commandant grade commandant poste commandant_unite variante terrain journée false ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[libre >libre] bord 15/87 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied ; unités : MISTRAL[libre >libre] bord 15/87 bouge 7 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#9816 à 70 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
carte:bloquer ok=true « [Barrer la rue · Sections MISTRAL 4 et MISTRAL 3] Ce qui va se passer : Les sections MISTRAL 4 et MISTRAL 3 partent à pied (~1 min) et barrent la terrasse de l'Orangerie d’une façade à l’autre. Personne ne passe. » 1er mouvement 1.5s
    +5s: MISTRAL 3[couper_circulation >couper_circulation] bord 3/19 bouge 13 ; MISTRAL 4[couper_circulation >couper_circulation] bord 3/19 bouge 12 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +20s: MISTRAL 3[couper_circulation >couper_circulation] bord 3/19 bouge 16 ; MISTRAL 4[couper_circulation >couper_circulation] bord 3/19 bouge 18 (j:inactif cv:- cmd:mise_en_place/adjoint prop:1 scope:tout à pied)
    +60s: MISTRAL 3[couper_circulation >couper_circulation] bord 3/19 bouge 0 ; MISTRAL 4[couper_circulation >couper_circulation] bord 3/19 bouge 0 (j:inactif cv:- cmd:conduite/adjoint prop:8 scope:tout à pied)
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|


unités en fin :
    MISTRAL[libre >libre/couper_circulation] bord 15/87 bouge 0
    FAUCON 1[libre >libre] bord 0/12 bouge 0
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 4 CHARLIE: ICI MISTRAL 4 CHARLIE. Je me place en protection de l’engin. TERMINÉ.
    MISTRAL ADJOINT: Chef, QUATRE-ZÉRO débouchés à tenir autour du parcours, je propose la mise en place du dispositif.
    MISTRAL 4 CHARLIE: ICI MISTRAL QUATRE CHARLIE. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL: MISTRAL 3 ICI MISTRAL. Barrez la rue, Terrasse de l'Orangerie, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.
    MISTRAL 4: ICI MISTRAL QUATRE. REÇU, je barre la rue, Terrasse de l'Orangerie. TERMINÉ.
    MISTRAL 3: ICI MISTRAL TROIS. REÇU, je barre la rue, Terrasse de l'Orangerie. TERMINÉ.
    MISTRAL: MISTRAL 4 ICI MISTRAL. Barrez la rue, Terrasse de l'Orangerie, d’une façade à l’autre. Plus personne ne passe, dans les deux sens. PARLEZ.
    MISTRAL 1 BRAVO: ICI MISTRAL UN BRAVO. REÇU, je suis votre mouvement. TERMINÉ.
    MISTRAL 1 BRAVO: ICI MISTRAL UN BRAVO. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL 4 BRAVO: MISTRAL ICI MISTRAL QUATRE BRAVO. Le cortège se forme, secteur place de la Concorde. Volume : UN-CINQ-ZÉRO, en hausse. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, place de la Concorde. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 BRAVO: MISTRAL UN ICI MISTRAL UN BRAVO. Dispositif de protection en place. PARLEZ.
    MISTRAL ADJOINT: Chef, automobiliste bloqué, pont de la Concorde, je propose d’y envoyer l’unité la plus proche.
    FAUCON 2: MISTRAL ICI FAUCON DEUX. Point d’effectif, secteur place de la Concorde. Nombre d’agents aptes : DEUX. TERMINÉ.

##  journee commandant republique passenger graine 7 SEUL carte:envoyer
config : rôle commandant grade commandant poste commandant_unite variante terrain journée true ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[embarquer >libre] bord 15/87 bouge 0 cv:route ; FAUCON 1[libre >libre] bord 12/12 bouge 0
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: Embarquez : véhicule de commandement MISTRAL
  monte à t=40 dans vl_commandement passenger
  t=41 j:embarquement cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: À bord : la colonne va partir
  t=128 j:route cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Rue du Temple
  t=436 j:route cv:stationnement cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Rue du Temple
  t=987 j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: 
ARRIVÉE à t=987 (sur_place)
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied ; unités : MISTRAL[debarquer >debarquer] bord 74/87 bouge 0 cv:debarquement ; FAUCON 1[colonne >libre] bord 12/12 bouge 0 ; TV 75-08[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-01[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#20413 à 225 m, pilote oui, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 26 ; carte : 26 unités « à moi »
carte:envoyer ok=true « [Y aller · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. » 1er mouvement 2.0s
    +5s: MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 7 cv:route (j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 2)
    +20s: MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 14 cv:route (j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 2)
    +60s: MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 19 cv:route (j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:5 scope:tout à pied afterConvoy:MISTRAL 2)
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|


unités en fin :
    MISTRAL[debarquer >debarquer/embarquer] bord 34/87 bouge 19 cv:en_place
    FAUCON 1[colonne >libre] bord 12/12 bouge 0
    TV 75-08[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-01[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL: CENTRAL ICI MISTRAL. Point d’effectif, secteur rue du Temple. Nombre d’agents aptes : SEPT. TERMINÉ.
    CENTRAL: TOUTES UNITÉS ICI CENTRAL. Point horaire : UNE-SIX heures UN-SIX. Toutes les unités restent à l’écoute. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. Incident clos sans traitement, secteur place de la République. Nature : automobiliste bloqué. Je le porte au compte rendu. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, rue Léon Jouhaux. Je demande une unité pour le dégager. PARLEZ.
    FAUCON 3: MISTRAL ICI FAUCON TROIS. Tour d’effectif terminé, secteur rue du Temple. Nombre d’agents aptes : DEUX. TERMINÉ.
    MISTRAL 4 ALFA: MISTRAL ICI MISTRAL QUATRE ALFA. Les esprits s’échauffent, secteur boulevard du Temple. Je resserre la ligne. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. Incident non traité, secteur rue Léon Jouhaux. Nature : automobiliste bloqué. Trop tard pour intervenir, mention au compte rendu. TERMINÉ.
    FAUCON 6: MISTRAL ICI FAUCON SIX. Ambiance qui se tend un peu, secteur boulevard du Temple. Je reste vigilant. TERMINÉ.
    ICARE: CENTRAL ICI ICARE. Cortège, boulevard du Temple. Volume dans le champ : TROIS-ZÉRO-ZÉRO. Attitude : calme. PARLEZ.
    MISTRAL 3 CHARLIE: MISTRAL ICI MISTRAL TROIS CHARLIE. Petits groupes mobiles dans les rues adjacentes, secteur boulevard du Temple. Je les suis à distance. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Les manifestants se dispersent, secteur boulevard du Temple. Volume restant : QUATRE-ZÉRO-ZÉRO. TERMINÉ.
    CENTRAL: À tous de CENTRAL : feu de conteneur, Quai de Valmy. Pompiers engagés.
    TV 75-08: CENTRAL ICI TV 75-08. R.A.S., patrouille avenue Winston Churchill. TERMINÉ.
    MISTRAL 2 CHARLIE: MISTRAL ICI MISTRAL DEUX CHARLIE. Effectif vérifié, secteur rue du Temple. Nombre d’agents aptes : CINQ. TERMINÉ.
    MISTRAL: CENTRAL de MISTRAL. Sur place, Rue du Temple. On débarque et on se met en place.
    MISTRAL 2: MISTRAL ICI MISTRAL DEUX. Embarqué, UN-NEUF à bord. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL: MISTRAL 2 ICI MISTRAL. Embarquez, mouvement en véhicules, deux tons, sur boulevard du Temple. PARLEZ.
    MISTRAL 2: ICI MISTRAL DEUX. REÇU, j’embarque. TERMINÉ.
    MISTRAL 2: À TOUS ICI MISTRAL DEUX. Embarquez, départ en colonne. TERMINÉ.
    MISTRAL 2: CENTRAL ICI MISTRAL DEUX. Départ en colonne, TROIS véhicules, deux tons. TERMINÉ.
    BAC 75O: CENTRAL ICI BAC 75O. R.A.S., patrouille place de l'Alma. TERMINÉ.
    CENTRAL: TOUTES UNITÉS ICI CENTRAL. Il est UNE-SIX heures QUATRE-CINQ. Point horaire. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Débarqué, en ligne face nord-est, CINQ-QUATRE à pied. PARLEZ.
    MISTRAL ADJOINT: Chef, TROIS-QUATRE débouchés à tenir autour du parcours, je propose la mise en place du dispositif.

##  mission commandant republique passenger graine 7 cdt-01-prise-de-commandement
config : rôle commandant grade capitaine poste commandant_unite variante terrain journée true ; scope tout « Commandant — tout le dispositif · à pied (carte partielle) » own=MISTRAL follow=MISTRAL
unités au départ : MISTRAL[embarquer >libre] bord 7/44 bouge 0 cv:route
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: Embarquez : véhicule de commandement MISTRAL
  monte à t=20 dans vl_commandement passenger
  t=21 j:embarquement cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: À bord : la colonne va partir
  t=45 j:route cv:route cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Place de la République
  t=590 j:route cv:stationnement cmd:arrivee/adjoint prop:0 scope:tout à bord | obj: En route en colonne : Place de la République
  t=610 j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied | obj: Accompagner le cortège jusqu’à la place de la Bastille sans emploi de la force / Ouvrir le parcours de délestage dès la panne du camion sonorisé / Rendre compte à la salle toutes les cinq minutes / Ne déplorer aucun agent blessé
ARRIVÉE à t=610 (sur_place)
mission phaseIndex 1
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied ; unités : MISTRAL[debarquer >debarquer] bord 44/44 bouge 0 cv:debarquement
fourgons cellulaires : fourgon_cellulaire#16584 à 1976 m, pilote non, état ok
scope à l'arrivée : tout « Commandant — tout le dispositif · à pied (carte partielle) » unités commandables 9 ; carte : 9 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[debarquer >debarquer] bord 7/44 bouge 17 cv:debarquement | MISTRAL[suivre >suivre] bord 7/44 bouge 35 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 10 | carte:envoyer | oui | [Y aller · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.5s | MISTRAL 1[embarquer >embarquer] bord 4/19 bouge 11 cv:route | MISTRAL 1[embarquer >embarquer] bord 15/19 bouge 0 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL avance en formation | 1.0s | MISTRAL[avancer >avancer] bord 19/44 bouge 16 cv:debarquement | MISTRAL[avancer >avancer] bord 21/44 bouge 24 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 40 | carte:disperser | oui | [Repousser la foule · Section MISTRAL 2] Ce qui va se passer : La section MISTRAL 2 part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 2.0s | MISTRAL 2[refoulement >refoulement] bord 3/19 bouge 4 | MISTRAL 2[refoulement >refoulement] bord 3/19 bouge 15 | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[embarquer >embarquer] bord 26/44 bouge 18 cv:debarquement | MISTRAL[embarquer >embarquer] bord 28/44 bouge 16 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL tient une ligne | 1.0s | MISTRAL[ligne >ligne] bord 28/44 bouge 20 cv:debarquement | MISTRAL[ligne >ligne] bord 29/44 bouge 19 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 70 | carte:bloquer | oui | [Barrer la rue · Section MISTRAL 1] Ce qui va se passer : La section MISTRAL 1 part en véhicules (~1 min) et barre la rue de Saintonge d’une façade à l’autre. Personne ne passe. | 2.5s | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 0 cv:route | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 14 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 80 | roue:5-interpeller | NON | visez quelqu’un (secteur grisé) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Aucun fait constaté près de la foule : le groupe MISTRAL 1 ALFA ne peut interpeller personne et refusera l’ordre. | 5.0s | MISTRAL 1 ALFA[embarquer] bord 7/7 bouge 0 | MISTRAL 1 ALFA[embarquer] bord 7/7 bouge 7 | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 100 | carte:encercler | oui | [Encercler (nasse) · 2 unités choisies par le jeu — 17 rues resteront ouvertes] Ce qui va se passer : Les 2 unités choisies par le jeu tiennent chacune une rue autour de la foule ; 17 rues restent ouvertes faute d’unités | 0.5s | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 5 cv:route ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 14 cv:route | MISTRAL 1[embarquer >embarquer] bord 19/19 bouge 12 cv:route ; MISTRAL 2[embarquer >embarquer] bord 19/19 bouge 19 cv:route | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1 |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL tient sa position | 0.5s | MISTRAL[tenir >tenir] bord 44/44 bouge 30 cv:debarquement | MISTRAL[tenir >tenir] bord 44/44 bouge 23 cv:debarquement | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL fait un bond en avant | 0.5s | MISTRAL[bond_offensif >bond_offensif] bord 44/44 bouge 23 cv:en_place | MISTRAL[bond_offensif >bond_offensif] bord 44/44 bouge 4 cv:en_place | j:sur_place cv:debarquement cmd:arrivee/adjoint prop:0 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 130 | carte:secours | oui | [Pompiers ici · personne] Ce qui va se passer : Les pompiers sont appelés sur ce point, place de la République : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:2 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL se replie | 1.0s | MISTRAL[repli >repli] bord 44/44 bouge 24 cv:en_place | MISTRAL[repli >repli] bord 44/44 bouge 40 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:2 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL attend | 0.5s | MISTRAL[cesser >cesser] bord 44/44 bouge 26 cv:en_place | MISTRAL[cesser >cesser] bord 44/44 bouge 26 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:3 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL sans ordre | 0.5s | MISTRAL[libre >libre] bord 44/44 bouge 9 cv:en_place | MISTRAL[libre >libre] bord 44/44 bouge 7 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:3 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL se protège (tortue) | 1.0s | MISTRAL[tortue >tortue] bord 44/44 bouge 7 cv:en_place | MISTRAL[tortue >tortue] bord 44/44 bouge 28 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:3 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 44/44 bouge 31 cv:en_place | MISTRAL[tortue >tortue] bord 44/44 bouge 40 cv:en_place | j:sur_place cv:en_place cmd:mise_en_place/adjoint prop:3 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL[tortue >tortue] bord 44/44 bouge 33 cv:en_place | MISTRAL[tortue >tortue] bord 44/44 bouge 19 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL[tortue >tortue] bord 44/44 bouge 26 cv:en_place | MISTRAL[tortue >tortue] bord 44/44 bouge 21 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL | 0.5s | MISTRAL[suivre >suivre] bord 7/44 bouge 14 cv:en_place | MISTRAL[suivre >suivre] bord 7/44 bouge 33 cv:en_place | j:sur_place cv:en_place cmd:conduite/adjoint prop:8 scope:tout à pied afterConvoy:MISTRAL 1,MISTRAL 2 |

unités en fin :
    MISTRAL[suivre >suivre] bord 7/44 bouge 33 cv:en_place
radio (fin) :
    MISTRAL: MISTRAL ICI MISTRAL. Bond offensif, DEUX-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    CENTRAL: ICI CENTRAL. Secours engagés sur le secteur place de la République. Arrivée dans DEUX minutes, tenez un accès dégagé. TERMINÉ.
    MISTRAL 2: ICI MISTRAL DEUX. REÇU, j’embarque. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Tenez la position. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Barrage en place, face nord-ouest, UN à pied. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je romps le contact, repli, boulevard de Magenta. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. URGENT. Demande les sapeurs-pompiers sur place, place de la République. Je sécurise l’accès. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Rompez le contact, repli par échelons, boulevard de Magenta. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Halte à l’action en cours. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL: CENTRAL ICI MISTRAL. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL: MISTRAL ICI MISTRAL. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL: CENTRAL ICI MISTRAL. Tortue formée, boucliers hauts. PARLEZ.
    Salle: Alerte compression, boulevard du Temple : 4,0 personnes au mètre carré. Ouvrez les issues.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, rue du Château d'Eau. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL: MISTRAL ICI MISTRAL. Me suivre à pied : en formation derrière moi. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je débarque et je me mets en place. TERMINÉ.
    SAPEUR 1: MISTRAL ICI SAPEUR UN. Secours à l’arrêt, secteur place de la République. Il nous faut un accès protégé pour intervenir. PARLEZ.
    MISTRAL: ICI MISTRAL. REÇU, je suis votre mouvement. TERMINÉ.
    MISTRAL 1 BRAVO: CENTRAL ICI MISTRAL UN BRAVO. Automobiliste bloqué dans la foule, secteur rue du Temple. Je demande une unité pour le dégager. PARLEZ.

##  mission commandant republique passenger graine 7 cg-01-six-dont-moi
config : rôle chef_groupe grade brigadier_chef poste chef_groupe variante  journée true ; scope unite « Chef de groupe — MISTRAL 1 ALFA » own=MISTRAL 1 ALFA follow=MISTRAL 1 ALFA
unités au départ : MISTRAL[embarquer >libre] bord 13/82 bouge 0 cv:route
  t=1 j:embarquement cv:route+attendJoueur cmd:arrivee/ia prop:0 scope:unite à pied | obj: Embarquez : fourgon de CRS MISTRAL 1 ALFA / Destination : Faire mouvement — Boulevard Richard-Lenoir
  monte à t=30 dans fourgon_crs passenger
  t=31 j:embarquement cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: À bord : la colonne va partir / Destination : Faire mouvement — Boulevard Richard-Lenoir
  t=116 j:route cv:route cmd:arrivee/ia prop:0 scope:unite à bord | obj: En route en colonne : Boulevard Richard-Lenoir
  t=719 j:route cv:stationnement cmd:arrivee/ia prop:0 scope:unite à bord | obj: Tenir l’angle de la rue Oberkampf pendant le passage du cortège / Garder le groupe regroupé, aucun agent isolé plus de quinze secondes / Rendre compte toutes les cinq minutes / Faire tourner les postes
  t=868 j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied | obj: Tenir l’angle de la rue Oberkampf pendant le passage du cortège / Garder le groupe regroupé, aucun agent isolé plus de quinze secondes / Rendre compte toutes les cinq minutes / Faire tourner les postes
ARRIVÉE à t=868 (sur_place)
mission phaseIndex 1
à l'arrivée : à pied ; j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied ; unités : MISTRAL[debarquer >debarquer] bord 69/82 bouge 0 cv:debarquement
fourgons cellulaires : fourgon_cellulaire#14601 à 58 m, pilote oui, état ok
scope à l'arrivée : unite « Chef de groupe — MISTRAL 1 ALFA » unités commandables 1 ; carte : 1 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 0.5s | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 4 | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 5 | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.0s | MISTRAL 1 ALFA[embarquer] bord 1/6 bouge 5 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 1/6 bouge 5 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL 1 ALFA avance en formation | 1.0s | MISTRAL 1 ALFA[avancer] bord 2/6 bouge 4 cv:route+attendJoueur | MISTRAL 1 ALFA[avancer] bord 5/6 bouge 1 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 40 | carte:disperser | oui | [Repousser la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | >10s | MISTRAL 1 ALFA[refoulement] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[refoulement] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL 1 ALFA | >10s | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL 1 ALFA tient une ligne | >10s | MISTRAL 1 ALFA[ligne] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[ligne] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part en véhicules (~1 min) et barre le passage Vendôme d’une façade à l’autre. Personne ne passe. | >10s | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | NON | visez quelqu’un (secteur grisé) | - |  |  | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Aucun fait constaté près de la foule : le groupe MISTRAL 1 ALFA ne peut interpeller personne et refusera l’ordre. | >10s | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 100 | carte:encercler | oui | [Encercler (nasse) · 1 unité choisie par le jeu — 17 rues resteront ouvertes] Ce qui va se passer : Chaque rue autour de la foule est tenue par une unité ; 17 rues restent ouvertes faute d’unités : la nasse ne sera pas f | >10s | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:debarquement cmd:arrivee/ia prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL 1 ALFA tient sa position | >10s | MISTRAL 1 ALFA[tenir] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tenir] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied afterConvoy:MISTRAL 1 ALFA |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL 1 ALFA fait un bond en avant | >10s | MISTRAL 1 ALFA[bond_offensif] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[bond_offensif] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Pompiers ici · personne] Ce qui va se passer : Les pompiers sont appelés sur ce point, près de Boulevard Richard-Lenoir : ils viennent éteindre ou secourir. | >10s |  |  | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL 1 ALFA se replie | >10s | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL 1 ALFA attend | >10s | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL 1 ALFA sans ordre | >10s | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL 1 ALFA se protège (tortue) | >10s | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 0.5s | MISTRAL 1 ALFA[debarquer] bord 5/6 bouge 0 cv:route+attendJoueur | MISTRAL 1 ALFA[debarquer] bord 6/6 bouge 0 cv:route+attendJoueur | j:sur_place cv:en_place cmd:mise_en_place/ia prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[debarquer >debarquer/tenir] bord 18/82 bouge 19 cv:en_place
radio (fin) :
    GARDIEN: Répète un peu, pour voir ? Chef, il me cherche, là !
    CENTRAL: MISTRAL ICI CENTRAL. Incident clos sans traitement, rue Jean-Pierre Timbaud. Nature : automobiliste bloqué. Je le porte au compte rendu. TERMINÉ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL 1 ALFA. URGENT. Demande les sapeurs-pompiers sur place, boulevard Richard-Lenoir. Je sécurise l’accès. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Rompez le contact, repli par échelons, boulevard Richard-Lenoir. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je romps le contact, repli, boulevard Richard-Lenoir. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Halte à l’action en cours. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je reprends ma mission. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Tortue formée, boucliers hauts. PARLEZ.
    SALLE: Attention, un agent insulté répond à une provocation.
    CENTRAL: MISTRAL ICI CENTRAL. Incident non traité, secteur rue de la Folie-Méricourt. Nature : automobiliste bloqué. Trop tard pour intervenir, mention au compte rendu. TERMINÉ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA, on n'attend plus que vous : embarquez !
    MISTRAL 4: MISTRAL ICI MISTRAL QUATRE. Barrage en place, face sud, front CINQ mètres, UN-SIX à pied. PARLEZ.
    SALLE: Attention, un manifestant filme l’échange à un mètre.
    MISTRAL: CENTRAL ICI MISTRAL. Fermeture effectuée : Avenue de la République. Véhicule en travers, déviation en place. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je débarque et je me mets en place. TERMINÉ.
    SAPEUR 1: MISTRAL ICI SAPEUR UN. Nous sommes arrêtés à la limite de la zone, secteur boulevard Richard-Lenoir. Nous attendons la sécurisation avant d’avancer. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA, on n'attend plus que vous : embarquez !
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Me suivre à pied : en formation derrière moi. PARLEZ.

##  mission commandant republique none graine 7 bravm-01-en-selle
config : rôle bravm grade gardien poste pilote_moto variante  journée true ; scope lecture « BRAV-M — lecture seule » own=BRAV-M 1 follow=BRAV-M 1
unités au départ : BRAV-M 1[suivre] bord 0/5 bouge 0
  t=1 j:inactif cv:- cmd:- prop:0 scope:lecture à pied | obj: Rouler en colonne de binômes jusqu’à la place Salvador Allende sans renverser un seul cône / Mettre pied à terre ensemble en moins de cinq secondes / Garder en colonne un intervalle de deux longueurs de moto
ARRIVÉE à t=1 (inactif)
mission phaseIndex 0
à l'arrivée : à pied ; j:inactif cv:- cmd:- prop:0 scope:lecture à pied ; unités : BRAV-M 1[suivre] bord 0/5 bouge 4
fourgons cellulaires : AUCUN
scope à l'arrivée : lecture « BRAV-M — lecture seule » unités commandables 0 ; carte : 0 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | 1.0s | BRAV-M 1[suivre] bord 0/5 bouge 4 | BRAV-M 1[suivre] bord 0/5 bouge 5 | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 10 | carte:envoyer | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 20 | roue:3-avancer | NON | (secteur 3 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 40 | carte:disperser | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : BRAV-M 1 | 1.0s | BRAV-M 1[embarquer] bord 4/5 bouge 1 | BRAV-M 1[embarquer] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 60 | roue:4-ligne | NON | (secteur 4 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 70 | carte:bloquer | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 80 | roue:5-interpeller | NON | (secteur 5 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 90 | carte:interpeller | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 100 | carte:encercler | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 110 | roue:8.5-tenir | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 120 | roue:8.2-bond | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 130 | carte:secours | NON | Carte — lecture seule | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 140 | roue:8.1-repli | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 150 | roue:8.6-cesser | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 160 | roue:8.7-libre | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 169 | roue:8.8-tortue | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 169 | roue:8.3-charge | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 169 | roue:8.4-gaz | NON | (secteur 8 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 169 | roue:6-pousser | NON | (secteur 6 absent de la roue de ce poste) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |
| 169 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | >10s | BRAV-M 1[debarquer] bord 5/5 bouge 0 | BRAV-M 1[debarquer] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:lecture à pied |

unités en fin :
    BRAV-M 1[debarquer] bord 5/5 bouge 0
radio (fin) :
    MONITEUR: Casque attaché, feux allumés, colonne par deux. La moto vous amène, c’est tout : on n’intervient jamais en roulant.
    FAUCON 1: FAUCON DEUX ICI FAUCON UN. Colonne par deux derrière moi, départ. Deux longueurs de moto entre chaque binôme. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je suis votre mouvement. TERMINÉ.
    Amine Breton: BRAV-M 1 ICI AMINE BRETON. Me suivre à pied : en formation derrière moi. PARLEZ.
    FAUCON 1: MISTRAL ICI FAUCON UN. Situation calme, secteur boulevard du Palais. TERMINÉ.
    MONITEUR: Regardez la sortie du virage, pas le cône. Et laissez deux motos devant vous, pas une et demie.
    PASSAGER: Doucement sur le frein avant, je pars en avant à chaque fois.
    CENTRAL: TOUTES UNITÉS ICI CENTRAL. Il est ZÉRO-NEUF heures UN-TROIS. Point horaire. TERMINÉ.
    Amine Breton: BRAV-M 1 ICI AMINE BRETON. Me suivre en colonne : embarquez, prenez place derrière mon véhicule. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, j’embarque. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Embarqué, DEUX à bord, TROIS agents restent à pied. PARLEZ.
    BRAV-M 1: AMINE BRETON ICI BRAV-M 1. En colonne, prête à vous suivre. TERMINÉ.
    SALLE: Attention, un cône est renversé par la moto qui vous précède.
    FAUCON 1: MISTRAL ICI FAUCON UN. Rien à signaler, secteur boulevard du Palais. Nous restons en attente. TERMINÉ.
    SALLE: Attention, le moniteur change le parcours au dernier moment.
    FAUCON 1: MISTRAL ICI FAUCON UN. Tour d’effectif terminé, secteur boulevard du Palais. Nombre d’agents aptes : SIX. TERMINÉ.
    FAUCON 1: MISTRAL ICI FAUCON UN. Néant, secteur boulevard du Palais. Les agents patientent. TERMINÉ.
    CENTRAL: TOUTES UNITÉS ICI CENTRAL. Point horaire : ZÉRO-NEUF heures QUATRE-QUATRE. Toutes les unités restent à l’écoute. TERMINÉ.
    FAUCON 1: MISTRAL ICI FAUCON UN. Compte de l’unité fait, secteur boulevard du Palais. Nombre d’agents aptes : SIX. TERMINÉ.
    Amine Breton: BRAV-M 1 ICI AMINE BRETON. Me suivre à pied : en formation derrière moi. PARLEZ.

##  surplace chef_groupe bastille none graine 5
config : rôle chef_groupe grade brigadier_chef poste chef_groupe variante  journée false ; scope unite « Chef de groupe — MISTRAL 1 ALFA » own=MISTRAL 1 ALFA follow=MISTRAL 1 ALFA
unités au départ : MISTRAL[libre >libre] bord 15/87 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied ; unités : MISTRAL[libre >libre/tenir] bord 15/87 bouge 32 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; TV 75-07[libre] bord 3/3 bouge 3 ; BAC 75N[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-03[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#7369 à 63 m, pilote non, état ok
scope à l'arrivée : unite « Chef de groupe — MISTRAL 1 ALFA » unités commandables 1 ; carte : 1 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 2.5s | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 4 | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 3 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part à pied (~1 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.5s | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 5 | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 5 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : MISTRAL 1 ALFA avance en formation | 2.5s | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 0 | MISTRAL 1 ALFA[avancer] bord 1/6 bouge 2 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 40 | carte:disperser | oui | [Repousser la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part à pied (~1 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 1.5s | MISTRAL 1 ALFA[refoulement] bord 1/6 bouge 5 | MISTRAL 1 ALFA[refoulement] bord 1/6 bouge 4 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : MISTRAL 1 ALFA | 1.5s | MISTRAL 1 ALFA[embarquer] bord 1/6 bouge 5 | MISTRAL 1 ALFA[embarquer] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : MISTRAL 1 ALFA tient une ligne | >10s | MISTRAL 1 ALFA[ligne] bord 6/6 bouge 0 | MISTRAL 1 ALFA[ligne] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Le groupe MISTRAL 1 ALFA part à pied (~1 min) et barre la rue Saint-Antoine d’une façade à l’autre. Personne ne passe. | >10s | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : MISTRAL 1 ALFA interpelle | >10s | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · Groupe MISTRAL 1 ALFA] Ce qui va se passer : Aucun fait constaté près de la foule : le groupe MISTRAL 1 ALFA ne peut interpeller personne et refusera l’ordre. | >10s | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | MISTRAL 1 ALFA[couper_circulation] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 100 | carte:encercler | NON | [Encercler (nasse) · personne] Choisissez d’abord l’unité (U). | - |  |  | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : MISTRAL 1 ALFA tient sa position | >10s | MISTRAL 1 ALFA[tenir] bord 6/6 bouge 0 | MISTRAL 1 ALFA[tenir] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : MISTRAL 1 ALFA fait un bond en avant | >10s | MISTRAL 1 ALFA[bond_offensif] bord 6/6 bouge 0 | MISTRAL 1 ALFA[bond_offensif] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Pompiers ici · personne] Ce qui va se passer : Les pompiers sont appelés sur ce point, près de Place de la Bastille : ils viennent éteindre ou secourir. | >10s |  |  | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : MISTRAL 1 ALFA se replie | >10s | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 | MISTRAL 1 ALFA[repli] bord 6/6 bouge 0 | j:inactif cv:- cmd:mise_en_place/ia prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : MISTRAL 1 ALFA attend | >10s | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 | MISTRAL 1 ALFA[cesser] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : MISTRAL 1 ALFA sans ordre | >10s | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 | MISTRAL 1 ALFA[libre] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : MISTRAL 1 ALFA se protège (tortue) | >10s | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | MISTRAL 1 ALFA[tortue] bord 6/6 bouge 0 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : MISTRAL 1 ALFA | 2.0s | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 5 | MISTRAL 1 ALFA[suivre] bord 1/6 bouge 5 | j:inactif cv:- cmd:conduite/ia prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[libre >libre/colonne] bord 15/87 bouge 36
    FAUCON 1[libre >libre] bord 0/12 bouge 0
    TV 75-07[libre] bord 3/3 bouge 3
    BAC 75N[libre] bord 3/3 bouge 0
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-03[libre] bord 3/3 bouge 3
radio (fin) :
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Barrage en place, face est, UN à pied. PARLEZ.
    CENTRAL: ICI CENTRAL. Sapeurs-pompiers en route vers place de la Bastille. Délai : UNE minute. Préparez l’accès. TERMINÉ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je tiens la position, place de la Bastille. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Tenez la position. PARLEZ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL 1 ALFA. URGENT. Demande les sapeurs-pompiers sur place, place de la Bastille. Je sécurise l’accès. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, bond offensif, puis halte et réalignement. TERMINÉ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL UN ALFA. Réouverture effectuée : Rue Saint-Antoine. La circulation reprend. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Bond effectué, ligne réalignée. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Rompez le contact, repli par échelons, boulevard Henri IV. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je romps le contact, repli, boulevard Henri IV. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Halte à l’action en cours. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Halte. Action interrompue, je tiens sur place. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Reprenez votre mission, initiative laissée. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, halte à l’action en cours. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je reprends ma mission. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, place de la Bastille. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL UN ICI MISTRAL UN ALFA. Tortue formée, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, tortue, boucliers hauts. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, rue des Tournelles. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 CHARLIE: MISTRAL ICI MISTRAL UN CHARLIE. Arrivé au point, en colonne par deux. PARLEZ.
    FAUCON 6: CENTRAL ICI FAUCON SIX. Automobiliste bloqué dans la foule, secteur rue Jacques Cœur. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 1 CHARLIE: ICI MISTRAL UN CHARLIE. REÇU, je protège l’élément désigné. TERMINÉ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je débarque et je me mets en place. TERMINÉ.
    MISTRAL 1 ALFA: MISTRAL 1 ALFA ICI MISTRAL 1 ALFA. Me suivre à pied : en formation derrière moi. PARLEZ.

##  surplace bravm_chef concorde none graine 21
config : rôle bravm grade brigadier_chef poste pilote_moto variante  journée false ; scope unite « Chef de groupe — BRAV-M 1 » own=BRAV-M 1 follow=BRAV-M 1
unités au départ : MISTRAL[libre >libre] bord 15/88 bouge 0 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; BRAV-M 1[suivre] bord 0/5 bouge 0
à l'arrivée : à pied ; j:inactif cv:- cmd:- prop:0 scope:unite à pied ; unités : MISTRAL[libre >libre/tenir] bord 15/88 bouge 55 ; FAUCON 1[libre >libre] bord 0/12 bouge 0 ; BRAV-M 1[suivre] bord 0/5 bouge 5 ; TV 75-03[libre] bord 3/3 bouge 3 ; BAC 75O[libre] bord 3/3 bouge 3 ; TV 75-09[libre] bord 3/3 bouge 3 ; BAC 75S[libre] bord 3/3 bouge 3 ; TV 75-07[libre] bord 3/3 bouge 3
fourgons cellulaires : fourgon_cellulaire#9816 à 74 m, pilote non, état ok
scope à l'arrivée : unite « Chef de groupe — BRAV-M 1 » unités commandables 1 ; carte : 1 unités « à moi »
| t | essai | accepté | texte | 1er mvt | +5 s | +10 s | étape |
|---|---|---|---|---|---|---|---|
| 0 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | >10s | BRAV-M 1[suivre] bord 0/5 bouge 0 | BRAV-M 1[suivre] bord 0/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 10 | carte:envoyer | oui | [Y aller · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 part à pied (~2 min) et avance en formation jusqu’à la foule, boucliers levés. | 1.5s | BRAV-M 1[avancer] bord 0/5 bouge 5 | BRAV-M 1[avancer] bord 0/5 bouge 5 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 20 | roue:3-avancer | oui | Ordre donné : BRAV-M 1 avance en formation | 1.5s | BRAV-M 1[avancer] bord 0/5 bouge 5 | BRAV-M 1[avancer] bord 0/5 bouge 5 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 30 | adjoint:accepter | NON | (aucune proposition exécutable ; 0 en tout) | - |  |  | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 40 | carte:disperser | oui | [Repousser la foule · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 part à pied (~2 min) et repousse la foule par bonds de 50 m, en lui laissant une sortie devant elle. | 2.0s | BRAV-M 1[refoulement] bord 0/5 bouge 5 | BRAV-M 1[refoulement] bord 0/5 bouge 5 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 50 | champ:suivez-moi-vehicules | oui | Ordre donné : BRAV-M 1 | 1.5s | BRAV-M 1[embarquer] bord 0/5 bouge 5 | BRAV-M 1[embarquer] bord 2/5 bouge 2 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 60 | roue:4-ligne | oui | Ordre donné : BRAV-M 1 tient une ligne | 1.5s | BRAV-M 1[ligne] bord 2/5 bouge 2 | BRAV-M 1[ligne] bord 2/5 bouge 3 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 70 | carte:bloquer | oui | [Barrer la rue · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 part à pied (~1 min) et barre la terrasse de l'Orangerie d’une façade à l’autre. Personne ne passe. | 1.0s | BRAV-M 1[couper_circulation] bord 2/5 bouge 3 | BRAV-M 1[couper_circulation] bord 4/5 bouge 1 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 80 | roue:5-interpeller | oui | Ordre donné : BRAV-M 1 interpelle | 1.0s | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 90 | carte:interpeller | oui | [Interpeller dans la foule · BRAV-M 1] Ce qui va se passer : La BRAV-M 1 part à pied (~2 min) et va constater près de la foule ; sans fait constaté, personne n’est interpellé. | >10s | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | BRAV-M 1[couper_circulation] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 100 | carte:encercler | NON | [Encercler (nasse) · personne] Choisissez d’abord l’unité (U). | - |  |  | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 110 | roue:8.5-tenir | oui | Ordre donné : BRAV-M 1 tient sa position | >10s | BRAV-M 1[tenir] bord 5/5 bouge 0 | BRAV-M 1[tenir] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 120 | roue:8.2-bond | oui | Ordre donné : BRAV-M 1 fait un bond en avant | >10s | BRAV-M 1[bond_offensif] bord 5/5 bouge 0 | BRAV-M 1[bond_offensif] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 130 | carte:secours | oui | [Pompiers ici · personne] Ce qui va se passer : Les pompiers sont appelés sur ce point, près de Place de la Concorde : ils viennent éteindre ou secourir. | >10s |  |  | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 140 | roue:8.1-repli | oui | Ordre donné : BRAV-M 1 se replie | >10s | BRAV-M 1[repli] bord 5/5 bouge 0 | BRAV-M 1[repli] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 150 | roue:8.6-cesser | oui | Ordre donné : BRAV-M 1 attend | >10s | BRAV-M 1[cesser] bord 5/5 bouge 0 | BRAV-M 1[cesser] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 160 | roue:8.7-libre | oui | Ordre donné : BRAV-M 1 sans ordre | >10s | BRAV-M 1[libre] bord 5/5 bouge 0 | BRAV-M 1[libre] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 170 | roue:8.8-tortue | oui | Ordre donné : BRAV-M 1 se protège (tortue) | >10s | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 180 | roue:8.3-charge | NON | Refusé : « Charger » demande : bâton et gazeuse ; la force autorisée n’est que : mains nues. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 190 | roue:8.4-gaz | NON | Refusé : « Disperser au gaz lacrymogène » demande : gaz lacrymogène et canon à eau ; la force autorisée n’est que : mains nues. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 200 | roue:6-pousser | NON | Aucun Centaure disponible sous vos ordres. | - | BRAV-M 1[tortue] bord 5/5 bouge 0 | BRAV-M 1[tortue] bord 5/5 bouge 0 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |
| 210 | champ:suivez-moi-pied | oui | Ordre donné : BRAV-M 1 | 0.5s | BRAV-M 1[suivre] bord 0/5 bouge 5 | BRAV-M 1[suivre] bord 0/5 bouge 3 | j:inactif cv:- cmd:- prop:0 scope:unite à pied |

unités en fin :
    MISTRAL[libre >libre/colonne] bord 15/88 bouge 30
    FAUCON 1[libre >libre] bord 0/12 bouge 0
    BRAV-M 1[suivre] bord 0/5 bouge 3
    TV 75-03[libre] bord 3/3 bouge 3
    BAC 75O[libre] bord 3/3 bouge 3
    TV 75-09[libre] bord 3/3 bouge 3
    BAC 75S[libre] bord 3/3 bouge 3
    TV 75-07[libre] bord 3/3 bouge 3
radio (fin) :
    CENTRAL: ICI CENTRAL. Secours en route vers le secteur place de la Concorde. Délai : DEUX minutes. Préparez l’accès. TERMINÉ.
    MISTRAL 3 CHARLIE: MISTRAL TROIS ICI MISTRAL TROIS CHARLIE. Dispositif de protection en place. PARLEZ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Barrage en place, Place de la Concorde, face nord-est, UN à pied. PARLEZ.
    MISTRAL 1 ALFA: ICI MISTRAL UN ALFA. REÇU, je protège l’élément désigné. TERMINÉ.
    BRAV-M 1: CENTRAL ICI BRAV-M 1. URGENT. Demande les sapeurs-pompiers sur place, place de la Concorde. Je sécurise l’accès. PARLEZ.
    BRAV-M 1: CENTRAL ICI BRAV-M UN. Bond effectué, ligne réalignée. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je romps le contact, repli, place de la Concorde. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Rompez le contact, repli par échelons, place de la Concorde. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, halte à l’action en cours. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Halte à l’action en cours. PARLEZ.
    MISTRAL 3 BRAVO: ICI MISTRAL TROIS BRAVO. REÇU, je protège l’élément désigné. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Reprenez votre mission, initiative laissée. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je reprends ma mission. TERMINÉ.
    BRAV-M 1: BRAV-M 1 ICI BRAV-M 1. Formez la tortue, boucliers hauts. PARLEZ.
    MISTRAL 1 ALFA: MISTRAL ICI MISTRAL UN ALFA. Dispositif de protection en place. PARLEZ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, place de la Concorde. Je demande une unité pour le dégager. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, tortue, boucliers hauts. TERMINÉ.
    MISTRAL 1 BRAVO: MISTRAL ICI MISTRAL UN BRAVO. Mise en place retardée : 3 agents encore loin de leur poste. Je poursuis. TERMINÉ.
    CENTRAL: MISTRAL ICI CENTRAL. URGENT. Automobiliste bloqué, cours la Reine. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 3 BRAVO: MISTRAL ICI MISTRAL TROIS BRAVO. Incident réglé, secteur place de la Concorde. Nature : automobiliste bloqué. Je me remets à votre disposition. PARLEZ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL UN ALFA. Automobiliste bloqué dans la foule, secteur place de la Concorde. Je demande une unité pour le dégager. PARLEZ.
    MISTRAL 2 BRAVO: MISTRAL ICI MISTRAL DEUX BRAVO. Barrage en place, face nord-ouest, front UN-QUATRE mètres, SIX à pied. PARLEZ.
    MISTRAL 1 ALFA: CENTRAL ICI MISTRAL UN ALFA. Véhicule civil immobilisé au milieu de la foule, secteur place de la Concorde. Occupants à bord, dégagement à prévoir. PARLEZ.
    BRAV-M 1: ICI BRAV-M UN. REÇU, je débarque et je me mets en place. TERMINÉ.
    SAPEUR 1: MISTRAL ICI SAPEUR UN. En attente de sécurisation, secteur place de la Concorde. Nous n’avançons pas sans protection ni itinéraire dégagé. PARLEZ.
