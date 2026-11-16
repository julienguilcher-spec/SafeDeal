# Compte rendu — contenu:missions

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le catalogue de missions est écrit : 129 missions réelles et complètes (MissionDef), plus la carrière de 14 chapitres et la campagne « semaine de mobilisation » en 6 actes. Les 153 tests passent et `tsc --noEmit` ne signale aucune erreur dans mes fichiers. Chaque mission comporte :
- un briefing en quatre paragraphes (Situation, Mission, Exécution, Consignes particulières) ;
- une note de renseignement ;
- au moins 3 phases avec des messages radio calqués sur la bible (CENTRAL, MISTRAL, FAUCON, NEPTUNE, ICARE, SANTÉ…) ;
- au moins 2 objectifs principaux et 1 secondaire, avec le bon ObjectiveKind ;
- au moins 1 condition d'échec, des aléas et une phrase « unique ».

Les points d'architecture à connaître :
- **Dossier :** `src/gameplay/missions/catalog/`. Les fichiers de rôle sont `crs`, `chef-groupe`, `commandant`, `bravm`, `centaure`, `canon-eau`, `drone`, `medecin`, `pompier`, `journaliste`, `manifestant` et `ecole`. S'y ajoutent `index`, `career`, `dsl` (petit langage de description) et `semaine` (les 6 actes de la campagne).
- **Écriture des textes :** `dsl.ts` applique la typographie française aux textes (espaces insécables avant ; : ! ?, dans les guillemets, apostrophes courbes), pour que les sources restent lisibles. Le briefing est assemblé sur le modèle « Situation. … / Mission. … / Exécution. … / Consignes particulières. … ».
- **Commissaire :** le commissaire n'existe plus. Ses anciennes missions (M29 à M35) sont des missions du commandant (`cdt-11` à `cdt-15`, chapitre 7 « L'écharpe »). `missionsFor('commissaire')` renvoie celles du commandant.
- **Rôles :** `secouriste` est le sapeur-pompier de Paris, `street_medic` le médecin bénévole. Le manifestant couvre les profils pacifique, famille, militant, service d'ordre, meneur, radical et opportuniste.
- **Miroirs :** 25 missions miroirs sur 15 scènes de base. Les miroirs partagent le lieu, l'heure, la foule et les moyens de leur base, avec `mirrorOf` et `altRoles` croisés. Par exemple `cdt-02` (commandant) a pour miroirs `journaliste-03`, `manifestant-10` et `drone-02`.
- **Carrière :** le chapitre 0 « L'école » compte 4 ateliers de formation. Les chapitres 1 à 8 montent du gardien stagiaire au commandant. Les chapitres 9 à 12 sont les détachements (BRAV-M, canon à eau, télépilote, Centaure). Le chapitre 13 « Regards croisés » regroupe les rôles civils. Chaque mission appartient à exactement un chapitre, et le test vérifie la réciprocité.
- **Campagne :** `CAMPAIGN_SEMAINE` suit 6 actes du commandant, de mardi à dimanche, taggés `semaine` et `acte-1` à `acte-6`. La tension passe de 0,1 à 0,6 et l'effectif de 1 000 à 3 000. Chaque acte reporte fatigue, blessés, image publique et colère de la rue.

Les tests couvrent la structure, les lieux, la neutralité et les marques :
- **Structure :** identifiants uniques en minuscules, minimum par rôle, bornes de chaque champ, typographie, miroirs, carrière, campagne.
- **Lieux :** tous les noms de lieux (place, parcours, points chauds, lieux d'objectifs) sont retrouvés dans `public/data/paris/places.json`, décodé avec `decodePlaces` de `src/world/mapdata.ts`. La recherche ignore la casse et les accents, et la correspondance partielle est admise. Plus de 90 % des noms correspondent exactement à un nom de la carte.
- **Neutralité :** une liste de contrôle de mots interdits (partis, syndicats, personnalités, marques réels) ne trouve rien. Tous les cortèges portent des noms fictifs (Front commun des Ateliers, Collectif Lumière Pour Tous, Bonnets Blancs…).

## API publique et mode d'emploi

`import { MISSIONS, missionById, missionsFor, mirrorsOf } from '@/gameplay/missions/catalog'` et `import { CAREER_CHAPTERS, CAMPAIGN_SEMAINE } from '@/gameplay/missions/catalog/career'`. MISSIONS: readonly MissionDef[]. missionById(id): MissionDef | undefined. missionsFor(role): MissionDef[] (le rôle commissaire renvoie celles du commandant). mirrorsOf(id): les versions d'une même scène sous d'autres rôles. CAREER_CHAPTERS: CareerChapter[]. CAMPAIGN_SEMAINE: Campaign (6 actes avec carryOver et tensionShift).

## Non fait / fragile

- Les 129 missions n'ont pas été jouées en jeu : le moteur de missions n'existe pas encore. Elles sont vérifiées par typage, par tests de structure et par recoupement avec la carte.
- Environ 40 phases n'ont qu'une phrase de texte (celles de fin de mission surtout), ce qui reste dans l'esprit « une à trois phrases » du schéma. Le test n'exige donc que 15 caractères minimum, et l'étoffement de ces phrases est laissé à la relecture.
- `extensions.ts` n'a pas été lu en entier : le catalogue ne dépend que de `contracts.ts` et de `missions-schema.ts`.
- Le chapitre 4 « La section » ne compte que 2 missions (le dossier 05 en prévoyait 4 variantes à 18 agents), et son seuil de passage est donc fixé à 2 missions.
- Le dossier 05 faisait du rôle « commissaire » un rôle distinct pour le chapitre 7. Il est remplacé par des missions du commandant, conformément au BRIEF. Le chapitre 5 « L'adjoint » garde le rôle `commandant`, avec le grade `capitaine` et le poste `commandant_unite`, pour que le commandement unique reste cohérent.
- Les cinq campagnes détachées du dossier (quatre ateliers de 3 minutes) utilisent le préréglage de durée `courte` (10 min). La durée de 3 minutes elle-même est à faire respecter par le moteur, via les objectifs et les conditions de temps.
- La carrière ne définit pas de barème de notes ni de règles de sanction : seuls `requiredMissions` et `requiredAverage` sont renseignés, selon l'échelle A = 4 … E = 0.

## Vérifications exécutées

- `npx vitest run tests/unit/missions-catalog` : 3 fichiers, 153 tests, tous verts.
- `npx tsc --noEmit` : aucune erreur dans src/gameplay/missions/catalog ni dans les tests missions-catalog.
- Tous les noms de lieux des missions (place, parcours, points chauds, lieux d'objectifs) sont retrouvés dans places.json décodé par decodePlaces ; plus de 90 % sont des correspondances exactes.
- Les 16 MissionType sont représentés et les missions couvrent 64 lieux de départ distincts.
- Aucun mot de la liste de contrôle (partis, syndicats, personnalités, marques réels) dans le catalogue.
- Chaque mission figure dans exactement un chapitre de carrière, et son champ chapter correspond à ce chapitre.
- Les 6 actes de la campagne existent, sont taggés semaine et acte-1 à acte-6, avec une tension et un effectif croissants.
- Les fichiers du brief, des notes d'intégration, de l'architecture et les trois fichiers core (contracts, extensions, missions-schema) n'ont pas été modifiés.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/dsl.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/index.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/career.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/semaine.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/ecole.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/crs.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/chef-groupe.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/commandant.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/bravm.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/centaure.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/canon-eau.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/drone.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/medecin.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/pompier.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/journaliste.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/missions/catalog/manifestant.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/missions-catalog.structure.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/missions-catalog.places.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/missions-catalog.words.test.ts
