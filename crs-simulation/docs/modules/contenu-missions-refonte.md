# Compte rendu — contenu:missions (refonte)

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Déroulé des 129 missions réécrit en entier (phases, déclencheurs, messages, aléas de phase), en partant de l'état corrigé : scènes, briefings, renseignement, échecs, carrière et campagne n'ont pas été touchés. Les cinq « it.todo » de recette sont devenus de vrais tests, tous verts, et j'ai vérifié par mutation qu'ils échouent bien sur des données fautives.

Ce qui a changé dans l'écriture :
- Chaque phase a un titre propre (619 titres, aucun repris), un texte de deux à trois phrases situé dans un lieu, un ou plusieurs messages et, sauf en fin de mission, des aléas imposés.
- Les messages d'une phase étant émis à son début, ce sont des messages REÇUS par le personnage (ordres, renseignements, demandes, voix de la rue). Plus aucun message sous « VOUS » ni sous l'indicatif du personnage ; un résultat n'est constaté que dans une phase ouverte par un objectif atteint.
- Chaque mission a au moins une phase close par un objectif (171 déclencheurs « objectif », 42 missions en ont deux ou plus). Les seuils de tension gardent une marge d'au moins 0,08 au-dessus de la tension de départ et vont croissant ; les phases de foule sont attendues dans l'ordre.
- Radio : deux aides ajoutées à dsl.ts, rad() et voix(), pour que la procédure soit juste par construction (APPELÉ ICI APPELANT, fin PARLEZ / TERMINÉ / FAITES L'APERÇU / COLLATIONNEZ, nombres chiffre par chiffre). Les rôles civils (manifestant, journaliste, secouriste de rue) n'ont plus que des voix en français courant.
- Contenu du dossier 05 repris pour les douze missions 4.1 à 4.12 (exemple M04 : barrières et fourgons, poussée, contournement par le quai des Tuileries, sommations, refoulement de cinquante mètres, retour au barrage).

Écarts par rapport à la consigne « ne refaire que le déroulé », à valider :
- Six objectifs touchés, parce qu'il fallait un objectif principal atteignable pour clore une phase : semaine-06 o3 passé de secondaire à principal ; o5 ajouté à bravm-07, centaure-08, manifestant-02, manifestant-04 et manifestant-06.
- Quatre fichiers dépassaient largement la limite de ~600 lignes d'ARCHITECTURE.md après réécriture ; je les ai découpés (crs-suite, chef-groupe-suite, commandant-suite, manifestant-radical). Les fichiers de rôle réexportent tout : aucun chemin d'import existant ne change.
- Les tests du déroulé sont dans un nouveau fichier, missions-catalog.deroule.test.ts, pour ne pas faire passer structure.test.ts au-delà de 600 lignes ; le bloc de todo y est remplacé par un renvoi.

Je n'ai rien commité. Les limites réelles sont listées dans notDone ; les deux plus importantes : 75 missions sur 129 comptent cinq phases, et aucun cadre de mission n'existe encore pour vérifier en jeu que les déclencheurs « objectif » se déclenchent.

## API publique et mode d'emploi

index.ts inchangé : MISSIONS, missionById, missionsFor, mirrorsOf et les tableaux par rôle. Ajouts à dsl.ts : rad(from, to, body, end = 'P') construit un message radio « APPELÉ ICI APPELANT. Corps. FIN » ; voix(who, text) construit une réplique en français courant ; type RadioEnd = 'P' | 'T' | 'A' | 'C'. Nouveaux modules crs-suite.ts, chef-groupe-suite.ts, commandant-suite.ts et manifestant-radical.ts, réexportés par crs.ts, chef-groupe.ts, commandant.ts et manifestant.ts : les imports existants (CDT_11 depuis './commandant', etc.) restent valables. Tous les identifiants de phase ont changé avec la réécriture ; aucun code ne s'appuyait dessus.

## Non fait / fragile

- Répartition du nombre de phases encore déséquilibrée : 75 missions sur 129 comptent cinq phases (58 %), 34 en ont quatre, 16 six, 4 trois, aucune sept. C'est mieux que 117 sur 129 à quatre phases, mais ce n'est pas uniforme ; le test n'impose qu'un plafond de 60 %. Je n'ai pas ajouté de phases pour faire baisser ce chiffre, faute de contenu qui ne soit pas du remplissage.
- Les déclencheurs « objectif » n'ont pas pu être essayés en jeu : il n'existe aucun cadre de mission consommant le catalogue (src/gameplay/missions ne contient que catalog/). Si un objectif n'est jamais atteint, la phase qui l'attend n'avance pas : le cadre de mission devra prévoir une issue (hors de mes fichiers).
- Trois phases se closent sur un objectif de type « protéger les siens » doté d'une durée ou d'un compte (manifestant-07 o1, 600 s ; manifestant-08 o1, 900 s ; manifestant-13 o2, cinq personnes). Le test l'admet ; il faudra que le cadre de mission sache constater « tenu N secondes » ou « N personnes dégagées » pour ce type.
- Le test « aucun résultat annoncé d'avance » est une heuristique : une liste de tournures, plus la règle de structure. Les phases ouvertes par un objectif en sont exemptées et n'ont été relues qu'à la main ; aucun test ne prouve l'absence de toute annonce implicite.
- La règle « le personnage ne parle pas sous son propre indicatif » n'est testée que pour les quatre rôles à indicatif unique (commandant, télépilote, canon à eau, Centaure). Pour CRS, chef de groupe, BRAV-M et secouriste, l'indicatif varie selon la mission : respecté à l'écriture, non testé.
- « Rapport entre le seuil de tension et la scène » et « contenu repris du dossier 05 » ne sont vérifiables qu'à la lecture ; je n'ai relu en entier après coup qu'une des douze missions du dossier (M04).
- Critères tenus au niveau de la mission, pas de chaque phase : 12 phases n'ont qu'un message et 27 phases non finales n'ont aucun aléa imposé (plus les 122 phases finales, volontairement sans aléa).
- Tolérance assumée à la radio : « CENT mètres » pour une distance ronde, comme dans les exemples de la bible ; les effectifs sont épelés (UN-ZÉRO-ZÉRO).
- Lectures incomplètes : je n'ai lu ni les dossiers 01, 03, 04 et 06, ni la bible au-delà des sections A et E, ni la section 5 du dossier 05 ; pour les missions 4.2 à 4.12 du dossier 05, seules les lignes « Phases » et « Aléas » ont été lues.
- Quelques lieux cités seulement dans la prose ne sont pas des noms exacts de la carte (Quartier latin, Île Saint-Louis, Institut de France). Tous les champs testés (place, parcours, points chauds, objectifs) le sont.
- journaliste.ts fait 603 lignes, à la limite de la consigne ; je ne l'ai pas découpé.
- La suite complète de tests du projet n'a pas été menée au bout (arrêtée à 280 s) ; seuls les quatre fichiers du catalogue ont été exécutés. Le catalogue n'a aucun autre consommateur. ESLint n'a pas été lancé : le dépôt n'a pas de fichier de configuration.
- Aucun commit de ma part. À noter : git montre qu'un autre processus a déjà intégré une partie de mes fichiers en cours de travail dans un commit (bravm, centaure, dsl, ecole, semaine).

## Vérifications exécutées

- npx vitest run tests/unit/missions-catalog : 4 fichiers, 177 tests passés, 0 todo (avant : 164 passés et 5 todo). Dernière exécution après la toute dernière modification.
- npx tsc --noEmit : 0 erreur sur tout le projet, après le découpage des fichiers et le nettoyage des imports inutilisés.
- Les cinq critères de recette sont des tests réels dans missions-catalog.deroule.test.ts : texte de phase en deux phrases au moins avec un lieu (120 à 420 caractères) ; aucun titre de moins de huit caractères ni repris plus de trois fois, et aucun des titres relevés (Fin, Départ, Évacuation, Dispersion, Repli, Suite, Retour, Arrivée) ; au moins une phase close par un objectif principal atteignable ; aucune tournure de résultat hors d'une phase ouverte par un objectif ; au moins six messages et trois aléas de phase par mission.
- Tests ajoutés au-delà des cinq critères : marge et croissance des seuils de tension, ordre des phases de foule, ni l'un ni l'autre sans foule ; phases minutées dans 85 % de la durée, échec « temps » compris ; trois à sept phases, au moins trente gabarits de déclencheurs, aucun au-dessus de 10 % ; aucun message sous « VOUS » ou sous l'indicatif du personnage ; aucun indicatif radio chez les rôles civils ; aucun chiffre arabe ni dizaine en toutes lettres dans un message radio ; au moins deux phases par mission nommant un lieu de la vraie carte.
- Contrôle par mutation : j'ai introduit volontairement cinq fautes dans une mission (titre « Fin », message « Bien joué… la rue est dégagée », seuil de tension trop proche, indicatif CENTRAL chez un manifestant, déclencheur sur un objectif garde-fou) ; les cinq tests concernés ont échoué en les nommant, puis le fichier a été restauré et la suite est repassée au vert.
- Tests existants toujours verts sans les assouplir : appelant = émetteur déclaré, fin de message réglementaire, texte exact des sommations, typographie française, mots interdits, lieux présents dans places.json, miroirs, carrière et campagne.
- Balayage typographique des 619 phases (doubles espaces, ponctuation collée, points de suspension, ponctuation finale) : aucune anomalie réelle.
- Balayage des phases non ouvertes par un objectif à la recherche de réussites sous-entendues (« merci pour… », « vous avez tenu… ») : deux répliques de drone-04 et drone-05 et deux de manifestant-04 neutralisées à la suite de ce contrôle.
- Relecture d'une mission complète du dossier 05 après réécriture (M04, pont de la Concorde) : les six temps du dossier y sont.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/dsl.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/ecole.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/crs.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/crs-suite.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/chef-groupe.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/chef-groupe-suite.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/commandant.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/commandant-suite.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/semaine.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/bravm.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/centaure.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/canon-eau.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/drone.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/medecin.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/pompier.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/journaliste.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/manifestant.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/manifestant-radical.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/missions-catalog.deroule.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/missions-catalog.structure.test.ts
