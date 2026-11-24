# Radio — bibliothèque de phrases

201 situations, 673 variantes (de 3 à 5 par situation), 17 familles.
Fichier généré par `tests/unit/radio.doc.test.ts` d'après `phrases/*.ts` : ne pas le modifier à la main.
Pour le régénérer : `RADIO_DOC=write npx vitest run tests/unit/radio.doc`.

## Utilisation

```ts
const phrases = ctx.require<RadioPhrases>('radio.phrases');   // import { RADIO_PHRASES_SERVICE } from '@/gameplay/radio'
phrases.say('prise_position', {}, { squad });                              // indicatif, secteur et face déduits de l'unité
phrases.say('bond_offensif', { distance: 30 }, { to: squad, at: point });   // ordre du commandant à une unité
phrases.say('secours_attente_securisation', {}, { from: 'SAPEUR 1', at });  // les pompiers disent une phrase du SAMU
phrases.text('sommation_premiere', { heure: 17.07, issue: 'rue de Rivoli' }); // texte seul, variante 0
```

- Tous les paramètres sont facultatifs : une valeur par défaut donne une phrase correcte, sans accolade, qui n'affirme rien que l'appelant n'a pas fourni (« non précisé », « à évaluer »).
- Les variantes d'une situation disent la même chose avec d'autres mots : la variante est tirée au hasard, jamais deux fois de suite la même.
- `say(clé, params, options)` retourne `false` si la clé est inconnue ou si le message est écarté (anti-répétition, file saturée).
- Options : `squad` (unité qui parle : indicatif, secteur, direction de face ; pour un ordre du commandant ou un message de la salle, l'unité à qui l'on parle), `at` (position dont on parle : nomme le secteur), `to` (destinataire : unité ou indicatif), `from` (indicatif imposé à l'émetteur), `personId`, `channel`, `priority`, `variant`.
- Un nombre fourni en paramètre est dit à la radio, chiffre par chiffre (`45` → « QUATRE-CINQ », `5000` → « CINQ MILLE », `100` → « CENT »). Une chaîne est reprise telle quelle.
- Forme du message : `APPELÉ ICI APPELANT. Corps. PARLEZ.` (réponse attendue) ou `TERMINÉ.` ; une réponse s'écrit `ICI APPELANT. Corps. TERMINÉ.` ; pas de formule de fin quand le corps se termine par « FAITES L'APERÇU », « COLLATIONNEZ » ou « ATTENDEZ ».
- Canal : « commandement » dès que la salle (CENTRAL) est l'un des correspondants, « unite » à l'intérieur de la compagnie, « secours » pour les demandes et les comptes rendus de secours. Un appel et sa réponse passent par le même canal.
- Le commandant est le chef unique (commandement et autorité habilitée) : il parle sous l'indicatif de sa compagnie, somme et décide lui-même ; aucune phrase ne demande d'autorisation à une autre autorité. Un ordre sans destinataire (`cible` absent) est adressé à « TOUTES UNITÉS ».
- Les situations `ambiance_*` (priorité 0) sont émises par le générateur d'ambiance, qui vérifie que le thème est vrai dans le monde ; les autres modules n'ont pas à les employer.

## Correspondants

| Rôle | Indicatif | Remplacement |
|---|---|---|
| `unite` | celui de l'unité (`options.squad`), sinon la compagnie | paramètre `unite`, `options.from` |
| `cible` | unité désignée par le commandant, sinon « TOUTES UNITÉS » | paramètre `cible`, `options.to` |
| `commandant` | la compagnie : « MISTRAL » (`session.config.extra.compagnie`) | — |
| `central` | « CENTRAL » | — |
| `tous` | « TOUTES UNITÉS » | — |
| `drone`, `canon`, `centaure`, `bravm`, `liaison` | « ICARE », « NEPTUNE 1 », « CENTAURE 1 », « FAUCON 1 », « LIAISON », ou l'unité réelle de ce type | paramètre du même nom, `options.from` / `options.to` |
| `samu`, `pompiers` | « SANTÉ 1 », « SAPEUR 1 » | paramètre du même nom, `options.from` / `options.to` |

## Paramètres

| Paramètre | Sens | Valeur par défaut |
|---|---|---|
| `heure` | heure dite à la radio : nombre 0..24 (« UNE-SEPT heures ZÉRO-QUATRE ») ou texte | heure de la session |
| `lieu` | secteur dont on parle, toujours écrit « secteur {lieu} » ; déduit de la position (options.at, sinon l'unité qui parle) par ctx.world.sectorName | « actuel » |
| `destination` | secteur vers lequel l'émetteur se déplace (« vers le secteur {destination} ») ; jamais déduit de sa position | « désigné » |
| `voie` | rue ou carrefour fermé ou rouvert à la circulation ; déduit de la position comme {lieu} s'il est absent | « voie désignée » |
| `issue` | issue laissée libre à la foule (« rue Saint-Antoine ») | « à l'opposé de la ligne » |
| `acces` | accès conseillé aux secours (« rue Royale ») | « par l'arrière du dispositif » |
| `station` | nom de la station de métro, écrit « station {station} » | « désignée » |
| `direction` | direction vers laquelle l'unité fait face, écrit « face {direction} » : point cardinal (« nord ») ; déduit du cap de l'unité qui parle | « à la foule » |
| `vers` | direction prise par un groupe ou un cortège (« rue Cambon », « nord ») | « non précisée » |
| `limite` | limite géographique d'une autorisation ou d'un refoulement (« rue de la Paix ») | « ligne actuelle » |
| `nombre` | quantité nommée par le libellé qui précède : volume de foule, effectif d'un groupe, nombre d'agents, de fourgons, de grenades… | « non précisé » |
| `effectif` | effectif à pied de la compagnie | « complet » |
| `indisponibles` | agents blessés ou hors de combat | « non précisé » |
| `interpelles` | nombre d'interpellés | « non précisé » |
| `lanceur` | grenades tirées au lanceur (compte rendu de consommation) | « non précisé » |
| `lbd` | tirs de lanceur de balles de défense (compte rendu de consommation) | « non précisé » |
| `distance` | distance en mètres | « quelques dizaines de » |
| `duree` | délai en minutes | « quelques » |
| `litres` | eau restante dans la cuve du canon à eau, en litres | « plusieurs milliers de » |
| `eau` | eau restante quand la cuve est presque vide, en litres | « quelques centaines de » |
| `pct` | part de la dotation restante, en pour cent | « moins de cinquante » |
| `moyen` | mode de déplacement (« à pied », « en véhicule ») | « à pied » |
| `mission` | mission confiée, à l'infinitif (« interdire le pont de la Concorde ») | « tenir le dispositif » |
| `cadre` | cadre juridique de la mission (« manifestation déclarée », « manifestation interdite ») | « à préciser » |
| `nature` | nature de la foule (« cortège déclaré », « rassemblement spontané ») | « à préciser » |
| `attitude` | attitude de la foule (« calme », « tendue », « hostile ») | « à préciser » |
| `gravite` | gravité d'une blessure, au féminin (« légère », « sérieuse », « critique ») | « à évaluer » |
| `type` | nature d'un incident ou d'un feu (« feu de poubelles », « véhicule en feu ») | « à préciser » |
| `objet` | matériaux d'une barricade | « poubelles et barrières » |
| `motif` | fait reproché à un interpellé (« jet de projectile sur agents ») | « infraction constatée » |
| `signalement` | signalement d'un individu, trois indices (« veste verte, bonnet noir, sac rouge ») | « à préciser » |
| `raison` | raison pour laquelle un ordre ne peut pas être exécuté | « unité déjà engagée » |
| `demande` | ce que la liaison demande aux organisateurs, avec son article (« un changement de parcours », « l'isolement des éléments violents ») | « l'arrêt de la tête de cortège » |
| `meteo` | temps et vent (« ciel couvert, vent d'ouest ») | « sans changement » |
| `renfort` | indicatif de l'unité envoyée en renfort | « une section de réserve » |
| `autre` | indicatif de l'unité à relever | « l'unité en ligne » |

## Situations

L'exemple est la première variante, rendue avec des valeurs d'exemple.

### Contrôle et mise en place

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `radio_controle` | unite → central | commandement | 1 | PARLEZ | 4 |  | CENTRAL ICI MISTRAL DEUX. Contrôle radio. PARLEZ. |
| `radio_controle_reponse` | central → unite (réponse) | commandement | 1 | TERMINÉ | 4 |  | ICI CENTRAL. FORT ET CLAIR. TERMINÉ. |
| `central_recu` | central → unite (réponse) | commandement | 1 | TERMINÉ | 3 |  | ICI CENTRAL. REÇU. TERMINÉ. |
| `central_attendez` | central → unite (réponse) | commandement | 1 | — | 3 |  | ICI CENTRAL. ATTENDEZ. |
| `stationnement` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `effectif` `nombre` | CENTRAL ICI MISTRAL DEUX. Compagnie en zone de stationnement, secteur place de la Concorde. Effectif à pied : SEPT-ZÉRO. Nombre de fourgons : UN-DEUX. Prêt. PARLEZ. |
| `mission_donnee` | central → unite | commandement | 1 | — | 4 | `mission` `lieu` `cadre` | MISTRAL DEUX ICI CENTRAL. Mission : interdire le pont de la Concorde. Secteur place de la Concorde. Cadre : manifestation déclarée. FAITES L’APERÇU. |
| `mission_apercu` | unite → central (réponse) | commandement | 1 | TERMINÉ | 3 | `mission` | ICI MISTRAL DEUX. APERÇU. TERMINÉ. |
| `dispositif_en_place` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `direction` `nombre` | CENTRAL ICI MISTRAL DEUX. Dispositif en place, secteur place de la Concorde, face nord. Nombre de sections en ligne : DEUX. Véhicules en travers. Prêt. PARLEZ. |
| `prise_position` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. En position, secteur place de la Concorde, face nord. PARLEZ. |
| `mouvement` | unite → central | commandement | 1 | PARLEZ | 4 | `destination` `moyen` | CENTRAL ICI MISTRAL DEUX. En mouvement vers le secteur place de la Madeleine. Déplacement à pied. PARLEZ. |
| `arrivee_zone` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Arrivé sur le secteur place de la Concorde. Mise en place en cours. PARLEZ. |
| `embarquement` | unite → central | commandement | 1 | PARLEZ | 3 | `destination` | CENTRAL ICI MISTRAL DEUX. Embarquement en cours, destination : secteur place de la Madeleine. PARLEZ. |
| `debarquement` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `distance` | CENTRAL ICI MISTRAL DEUX. Débarquement en cours, secteur place de la Concorde, à TROIS-ZÉRO mètres de la foule. PARLEZ. |
| `ordre_tenir` | commandant → cible | unite | 1 | PARLEZ | 4 | `lieu` `direction` | MISTRAL TROIS ICI MISTRAL. Tenez le secteur place de la Concorde, face nord. Riposte directe seulement. PARLEZ. |
| `ordre_mouvement` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` `moyen` | MISTRAL TROIS ICI MISTRAL. Portez-vous sur le secteur place de la Concorde, déplacement à pied. Rendez compte à l’arrivée. PARLEZ. |
| `ordre_ligne` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` `direction` | MISTRAL TROIS ICI MISTRAL. Formez un barrage, secteur place de la Concorde, face nord. Boucliers jointifs, deuxième rang en appui. PARLEZ. |
| `ordre_embarquer` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Embarquez et rejoignez le secteur place de la Concorde. Débarquement à cinquante mètres de la foule au moins. PARLEZ. |
| `ordre_recu` | unite → commandant (réponse) | unite | 1 | TERMINÉ | 4 |  | ICI MISTRAL DEUX. REÇU, j’exécute. TERMINÉ. |
| `ordre_impossible` | unite → commandant (réponse) | unite | 1 | PARLEZ | 3 | `raison` | ICI MISTRAL DEUX. NÉGATIF. Je ne peux pas exécuter : unité engagée sur un autre incident. PARLEZ. |
| `ordre_objections` | unite → commandant | unite | 2 | PARLEZ | 3 |  | MISTRAL ICI MISTRAL DEUX. Je fais part de mes objections : l’ordre reçu me paraît manifestement illégal. Je demande sa confirmation. PARLEZ. |

### Préparation et prévention

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `prevention_mobilier` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Retrait du mobilier urbain terminé sur le parcours, secteur place de la Concorde. Poubelles, barrières et conteneurs enlevés. PARLEZ. |
| `prevention_controles` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Point de contrôle en place en amont du rassemblement, secteur place de la Concorde. Nombre de personnes contrôlées : SIX-ZÉRO. PARLEZ. |
| `prevention_perimetre` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Périmètre interdit en place, secteur place de la Concorde. Accès tenus, riverains et secours seuls admis. PARLEZ. |

### Compte rendu de situation

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `cortege_approche` | unite → central | commandement | 1 | PARLEZ | 4 | `distance` `lieu` `nature` `nombre` `attitude` | CENTRAL ICI MISTRAL DEUX. Tête de cortège à TROIS-ZÉRO mètres, secteur place de la Concorde. Nature : cortège déclaré. Volume : TROIS MILLE. Attitude : calme. PARLEZ. |
| `foule_calme` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Foule calme, secteur place de la Concorde. Volume : TROIS MILLE. Aucun incident. PARLEZ. |
| `foule_croissante` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. L’affluence grossit, secteur place de la Concorde. Volume estimé : TROIS MILLE. PARLEZ. |
| `foule_tendue` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Attitude tendue en tête, secteur place de la Concorde. Volume : TROIS MILLE. Invectives vers la ligne. PARLEZ. |
| `foule_hostile` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Foule hostile, secteur place de la Concorde. Volume : TROIS MILLE. Des groupes déterminés viennent au contact de la ligne. PARLEZ. |
| `situation_ras` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Rien à signaler, secteur place de la Concorde. Situation calme. PARLEZ. |
| `situation_tendue` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Situation tendue, secteur place de la Concorde. Je reste vigilant et je garde ma réserve à portée. PARLEZ. |
| `situation_degradee` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Situation dégradée, secteur place de la Concorde. Violences en cours, je demande vos instructions. PARLEZ. |
| `situation_apaisee` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Retour au calme, secteur place de la Concorde. Les violences ont cessé. PARLEZ. |
| `cortege_arrete` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Cortège à l’arrêt, secteur place de la Concorde. Tête immobilisée. Volume : TROIS MILLE. PARLEZ. |
| `cortege_reparti` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Le cortège repart, secteur place de la Concorde. Tête en marche. Volume : TROIS MILLE. PARLEZ. |
| `cortege_hors_parcours` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `vers` `nombre` | CENTRAL ICI MISTRAL DEUX. Le cortège quitte le parcours déclaré, secteur place de la Concorde. Direction prise : rue Cambon. Volume : TROIS MILLE. PARLEZ. |

### Signes avant-coureurs

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `signe_nebuleuse` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. La nébuleuse de tête grossit, secteur place de la Concorde. Volume devant la banderole de tête : QUATRE-ZÉRO-ZÉRO. PARLEZ. |
| `signe_visages_couverts` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Visages qui se couvrent, secteur place de la Concorde. Nombre de personnes masquées : QUATRE-ZÉRO. PARLEZ. |
| `signe_fumigenes` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Fumigène noir allumé en tête, secteur place de la Concorde. Signal de ralliement probable. PARLEZ. |
| `signe_changement_tenue` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Individus qui se changent à couvert, secteur place de la Concorde. Tenues sombres sorties des sacs, effectif du groupe : QUATRE-ZÉRO. PARLEZ. |
| `signe_bloc` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Un bloc se forme, secteur place de la Concorde. Banderole renforcée en tête, effectif : QUATRE-ZÉRO. PARLEZ. |
| `signe_parapluies` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Parapluies ouverts en tête, secteur place de la Concorde. Ils masquent un groupe, effectif estimé : QUATRE-ZÉRO. PARLEZ. |
| `signe_depavage` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Chaussée dépavée, secteur place de la Concorde. Des pavés sont descellés et mis en tas. PARLEZ. |
| `signe_projectiles_reunis` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Réserve de projectiles constituée, secteur place de la Concorde. Pavés et bouteilles rassemblés derrière le premier rang. PARLEZ. |
| `signe_materiel_voie` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `objet` | CENTRAL ICI MISTRAL DEUX. Mobilier tiré en travers de la voie, secteur place de la Concorde. Matériaux : poubelles et barrières de chantier. PARLEZ. |

### Violences et jets

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `jets_projectiles` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Jets de projectiles sur la ligne, secteur place de la Concorde. Je tiens face nord. PARLEZ. |
| `jets_mortiers` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tirs de mortiers d’artifice sur la ligne, secteur place de la Concorde. Tirs tendus, les agents se couvrent derrière les boucliers. PARLEZ. |
| `jets_incendiaires` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Engins incendiaires lancés sur la ligne, secteur place de la Concorde. Flammes au sol devant les boucliers, je fais éteindre. PARLEZ. |
| `jets_cesses` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Les jets ont cessé, secteur place de la Concorde. Je garde la ligne. PARLEZ. |
| `assaut_ligne` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. URGENT. Assaut sur la ligne, secteur place de la Concorde. Groupe organisé au contact, effectif : QUATRE-ZÉRO. PARLEZ. |
| `violences_unite` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Violences sur l’unité, secteur place de la Concorde. J’emploie la force d’initiative, cadre violences et voies de fait. Avertissement fait à la foule. PARLEZ. |
| `retour_gaz` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Retour de gaz sur la ligne, secteur place de la Concorde. Vent de face, je suspends les tirs et je fais mettre les masques. PARLEZ. |
| `degradations` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Dégradations en cours, secteur place de la Concorde. Vitrines brisées, effectif du groupe : QUATRE-ZÉRO. PARLEZ. |

### Agents et blessés

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `agent_blesse` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Un agent blessé, secteur place de la Concorde. Gravité : légère. Je le fais sortir de la ligne. PARLEZ. |
| `agent_a_terre` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Agent à terre, secteur place de la Concorde. Je lance le dégagement. PARLEZ. |
| `agent_degage` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. Agent dégagé, secteur place de la Concorde. Il est à l’abri derrière la ligne. Gravité : légère. PARLEZ. |
| `agent_isole` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Agent isolé, secteur place de la Concorde. Coupé de son groupe, je l’envoie chercher. PARLEZ. |
| `civil_blesse` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Un manifestant blessé, secteur place de la Concorde. Gravité : légère. Demande SANTÉ sur place, je sécurise. PARLEZ. |
| `bilan_effectif` | unite → central | commandement | 1 | PARLEZ | 3 | `nombre` `indisponibles` | CENTRAL ICI MISTRAL DEUX. Point d’effectif. Nombre d’agents disponibles : UN-QUATRE. Hors de combat : UN. PARLEZ. |

### Renforts, munitions et relèves

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `demande_renfort` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. URGENT. Demande renfort, secteur place de la Concorde. Ligne sous pression, effectif demandé : UN-SIX. PARLEZ. |
| `renfort_accorde` | central → unite (réponse) | commandement | 1 | TERMINÉ | 3 | `renfort` `lieu` `duree` | ICI CENTRAL. Renfort accordé : ÉPERVIER TROIS vous rejoint, secteur place de la Concorde. Délai : TROIS minutes. TERMINÉ. |
| `renfort_refuse` | central → unite (réponse) | commandement | 1 | TERMINÉ | 3 |  | ICI CENTRAL. NÉGATIF. Aucun renfort disponible pour le moment. Tenez avec vos moyens. TERMINÉ. |
| `renfort_arrive` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Renfort arrivé, secteur place de la Concorde. Je l’intègre au dispositif. PARLEZ. |
| `munitions_basses` | unite → central | commandement | 1 | PARLEZ | 3 | `pct` | CENTRAL ICI MISTRAL DEUX. Munitions basses : grenades lacrymogènes à DEUX-CINQ pour cent. Réapprovisionnement à prévoir. PARLEZ. |
| `munitions_epuisees` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Plus de grenades lacrymogènes, secteur place de la Concorde. Je demande un ravitaillement immédiat. PARLEZ. |
| `ravitaillement_demande` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Demande de ravitaillement, secteur place de la Concorde : grenades et eau pour les agents. PARLEZ. |
| `ravitaillement_ordonne` | commandant → cible | unite | 1 | PARLEZ | 3 |  | MISTRAL TROIS ICI MISTRAL. Ravitaillez-vous aux fourgons, un groupe après l’autre. La ligne reste tenue pendant le mouvement. PARLEZ. |
| `ravitaillement_effectue` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Ravitaillement effectué, secteur place de la Concorde. Dotation de nouveau complète. PARLEZ. |
| `releve_demande` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Demande de relève, secteur place de la Concorde. Fatigue marquée, nombre d’agents encore aptes : UN-QUATRE. PARLEZ. |
| `releve_ordonnee` | commandant → cible | unite | 1 | PARLEZ | 3 | `autre` `lieu` | MISTRAL TROIS ICI MISTRAL. Relevez MISTRAL UN sur place, secteur place de la Concorde. Passage de ligne. PARLEZ. |
| `releve_en_cours` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Relève en cours, secteur place de la Concorde. Passage de ligne. PARLEZ. |
| `releve_effectuee` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Relève effectuée, secteur place de la Concorde. Je tiens la ligne face nord, l’unité relevée récupère aux véhicules. PARLEZ. |

### Sommations et emploi de la force

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `sommation_annonce` | commandant → tous | unite | 2 | TERMINÉ | 3 | `lieu` | TOUTES UNITÉS ICI MISTRAL. Je constate l’attroupement, secteur place de la Concorde, et je procède à l’annonce. Aucun emploi de la force avant mon ordre. TERMINÉ. |
| `sommation_premiere` | commandant → central | commandement | 2 | TERMINÉ | 3 | `heure` `lieu` `issue` | CENTRAL ICI MISTRAL. Première sommation faite à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Issue ouverte : rue de Rivoli. TERMINÉ. |
| `sommation_derniere` | commandant → central | commandement | 2 | TERMINÉ | 3 | `heure` `lieu` `issue` | CENTRAL ICI MISTRAL. Dernière sommation faite à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Issue ouverte : rue de Rivoli. TERMINÉ. |
| `sommation_reiteree` | commandant → central | commandement | 2 | TERMINÉ | 3 | `heure` `lieu` `issue` | CENTRAL ICI MISTRAL. Dernière sommation réitérée à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde, avant l’usage des armes. Issue ouverte : rue de Rivoli. TERMINÉ. |
| `sommation_fusee_rouge` | commandant → central | commandement | 2 | TERMINÉ | 3 | `heure` `lieu` | CENTRAL ICI MISTRAL. Fusée rouge tirée à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde, en complément de la sommation. TERMINÉ. |
| `sommations_effectuees` | commandant → central | commandement | 2 | TERMINÉ | 3 | `lieu` `issue` `heure` | CENTRAL ICI MISTRAL. Sommations effectuées, secteur place de la Concorde. Annonce, première et dernière sommation faites. Issue ouverte : rue de Rivoli. TERMINÉ. |
| `force_niveau_0` | commandant → cible | unite | 2 | TERMINÉ | 3 |  | MISTRAL TROIS ICI MISTRAL. Aucun emploi de la force. Présence et barrage statique seulement, distance conservée avec la foule. TERMINÉ. |
| `force_niveau_1` | commandant → cible | unite | 2 | — | 3 | `limite` | MISTRAL TROIS ICI MISTRAL. Emploi de la force autorisé : refoulement au bouclier, sans bâton ni gaz. Limite : rue de la Paix. FAITES L’APERÇU. |
| `force_niveau_2` | commandant → cible | unite | 2 | — | 3 | `limite` | MISTRAL TROIS ICI MISTRAL. Emploi de la force autorisé : bâton de défense et aérosol lacrymogène, aucune grenade. Limite : rue de la Paix. FAITES L’APERÇU. |
| `force_niveau_3` | commandant → cible | unite | 2 | — | 3 | `limite` | MISTRAL TROIS ICI MISTRAL. Emploi de la force autorisé : grenades lacrymogènes et canon à eau. Lanceurs en tir courbe seulement. Limite : rue de la Paix. FAITES L’APERÇU. |
| `force_niveau_4` | commandant → cible | unite | 2 | — | 3 | `limite` | MISTRAL TROIS ICI MISTRAL. Usage des armes autorisé : grenades assourdissantes et de désencerclement. Lanceur de balles de défense en riposte seulement, sur objectif désigné. Limite : rue de la Paix. COLLATIONNEZ. |
| `force_niveau_5` | commandant → cible | unite | 2 | — | 3 |  | MISTRAL TROIS ICI MISTRAL. Rappel du cadre : arme de service en légitime défense seulement, absolue nécessité et stricte proportionnalité. COLLATIONNEZ. |
| `force_apercu` | unite → commandant (réponse) | unite | 1 | TERMINÉ | 3 | `limite` | ICI MISTRAL DEUX. APERÇU. Je collationne : emploi de la force autorisé, limite : rue de la Paix. TERMINÉ. |
| `force_suspendue` | commandant → tous | unite | 2 | TERMINÉ | 3 |  | TOUTES UNITÉS ICI MISTRAL. Halte à l’emploi de la force : le trouble a cessé. Retour au barrage statique. TERMINÉ. |
| `fin_emploi_force` | commandant → central | commandement | 2 | TERMINÉ | 3 | `heure` `lieu` | CENTRAL ICI MISTRAL. Fin d’emploi de la force à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Le trouble a cessé. TERMINÉ. |
| `tir_lbd` | unite → commandant | unite | 1 | PARLEZ | 3 | `distance` | MISTRAL ICI MISTRAL DEUX. Un tir de lanceur de balles de défense, cadre riposte, sur objectif désigné à TROIS-ZÉRO mètres. Je fais vérifier l’état de santé de l’individu. PARLEZ. |
| `desencerclement_employe` | unite → commandant | unite | 2 | PARLEZ | 3 | `lieu` | MISTRAL ICI MISTRAL DEUX. Grenade de désencerclement employée, secteur place de la Concorde. Unité encerclée, lancer au ras du sol. PARLEZ. |

### Manœuvres

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `gaz_main` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Lacrymogènes à main sur le secteur place de la Concorde, sur mon ordre. PARLEZ. |
| `gaz_lanceur` | commandant → cible | unite | 1 | PARLEZ | 3 | `distance` `lieu` | MISTRAL TROIS ICI MISTRAL. Lanceurs, TROIS-ZÉRO mètres, tir courbe, secteur place de la Concorde. Sur mon ordre. PARLEZ. |
| `gaz_suspendu` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tirs de lacrymogènes suspendus, secteur place de la Concorde. PARLEZ. |
| `bond_offensif` | commandant → cible | unite | 1 | PARLEZ | 3 | `distance` `lieu` | MISTRAL TROIS ICI MISTRAL. Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement. PARLEZ. |
| `bond_realigne` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Bond effectué, secteur place de la Concorde. Ligne réalignée, boucliers jointifs. PARLEZ. |
| `charge` | commandant → cible | unite | 2 | PARLEZ | 3 | `distance` `lieu` | MISTRAL TROIS ICI MISTRAL. Chargez sur TROIS-ZÉRO mètres, secteur place de la Concorde. Arrêt au sifflet, repli au pas sur la ligne de départ. PARLEZ. |
| `charge_arretee` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Charge terminée, secteur place de la Concorde. Arrêt au sifflet, repli au pas sur la ligne de départ. PARLEZ. |
| `repli` | commandant → cible | unite | 1 | TERMINÉ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Rompez le contact, repli par échelons sur le secteur place de la Concorde. TERMINÉ. |
| `repli_effectue` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Repli effectué, secteur place de la Concorde. Dispositif reformé. PARLEZ. |
| `encerclement_ordre` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Encerclez le groupe violent, secteur place de la Concorde. Un point de sortie contrôlé reste ouvert, information des personnes retenues toutes les minutes. PARLEZ. |
| `encerclement_en_place` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Encerclement en place, secteur place de la Concorde. Nombre de personnes retenues : QUATRE-ZÉRO. Point de sortie contrôlé ouvert. PARLEZ. |
| `encerclement_leve` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Encerclement levé, secteur place de la Concorde. Les personnes retenues sortent par le point contrôlé. PARLEZ. |
| `refoulement` | commandant → cible | unite | 1 | PARLEZ | 3 | `limite` | MISTRAL TROIS ICI MISTRAL. Refoulement par bonds de cinquante mètres, limite : rue de la Paix. Issue libre devant la foule. PARLEZ. |
| `refoulement_effectue` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Refoulement effectué, secteur place de la Concorde. Limite atteinte, je tiens la ligne. PARLEZ. |
| `tortue` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tortue formée, secteur place de la Concorde. Boucliers de face et au-dessus des têtes. PARLEZ. |
| `ligne_formee` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Ligne formée, secteur place de la Concorde, face nord. Boucliers jointifs, deuxième rang en place. PARLEZ. |
| `dispersion_en_cours` | unite → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Dispersion en cours, secteur place de la Concorde. Volume restant : TROIS MILLE. PARLEZ. |
| `dispersion_effectuee` | unite → central | commandement | 1 | PARLEZ | 3 | `heure` `lieu` | CENTRAL ICI MISTRAL DEUX. Dispersion effective à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Chaussée libre. PARLEZ. |

### Interpellations

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `interpellation_ordre` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` `signalement` | MISTRAL TROIS ICI MISTRAL. Interpellez l’individu désigné, secteur place de la Concorde, sur fait constaté. Signalement : veste verte, bonnet noir, sac rouge. PARLEZ. |
| `interpellation_en_cours` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Interpellation en cours, secteur place de la Concorde. Le groupe d’interpellation est sorti de la ligne. PARLEZ. |
| `interpellation_effectuee` | unite → central | commandement | 1 | PARLEZ | 3 | `motif` `heure` `lieu` | CENTRAL ICI MISTRAL DEUX. Un interpellé pour jet de projectile sur agents, à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Il est conduit au fourgon cellulaire. PARLEZ. |
| `interpelle_conduit` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Un interpellé conduit au fourgon cellulaire, secteur place de la Concorde. Deux agents l’accompagnent. PARLEZ. |
| `remise_interpelle` | unite → central | commandement | 1 | PARLEZ | 3 | `heure` `nombre` | CENTRAL ICI MISTRAL DEUX. Interpellés à bord du fourgon cellulaire à UNE-SEPT heures ZÉRO-QUATRE, en attente de transfert. Nombre : DEUX. Fiches transmises. PARLEZ. |

### Incidents

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `incident_feu` | unite → central | commandement | 2 | PARLEZ | 4 | `lieu` `type` | CENTRAL ICI MISTRAL DEUX. URGENT. Feu signalé, secteur place de la Concorde. Nature : feu de poubelles. Je demande un moyen d’extinction. PARLEZ. |
| `incident_feu_reprise` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Reprise de feu, secteur place de la Concorde. Une batterie s’est rallumée, il faut de l’eau en quantité. PARLEZ. |
| `incident_blesse` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Blessé à aller chercher, secteur place de la Concorde. Gravité : légère. Équipe à désigner pour l’extraire. PARLEZ. |
| `incident_pillage` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Pillage en cours, secteur place de la Concorde. Commerce forcé, effectif du groupe : QUATRE-ZÉRO. Unité à désigner. PARLEZ. |
| `incident_barricade` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `objet` | CENTRAL ICI MISTRAL DEUX. Barricade signalée, secteur place de la Concorde. Matériaux : poubelles et barrières de chantier. Obstacle à dégager. PARLEZ. |
| `incident_automobiliste` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Automobiliste bloqué dans la foule, secteur place de la Concorde. Je demande une unité pour le dégager. PARLEZ. |
| `incident_secours_bloques` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Secours empêchés d’avancer, secteur place de la Concorde. Il faut leur ouvrir un couloir. PARLEZ. |
| `incident_suspect` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `signalement` | CENTRAL ICI MISTRAL DEUX. Individu suspect signalé, secteur place de la Concorde. Signalement : veste verte, bonnet noir, sac rouge. Unité à désigner pour le contrôler. PARLEZ. |
| `incident_delegue` | commandant → cible | unite | 1 | PARLEZ | 4 | `lieu` `type` | MISTRAL TROIS ICI MISTRAL. Je vous confie un incident, secteur place de la Concorde. Nature : feu de poubelles. Vous y allez et vous rendez compte. PARLEZ. |
| `incident_accuse` | unite → commandant (réponse) | unite | 1 | TERMINÉ | 3 |  | ICI MISTRAL DEUX. APERÇU, je prends l’incident. TERMINÉ. |
| `incident_traite` | unite → commandant | unite | 1 | PARLEZ | 4 | `lieu` `type` | MISTRAL ICI MISTRAL DEUX. Incident traité, secteur place de la Concorde. Nature : feu de poubelles. Je reprends ma mission. PARLEZ. |
| `incident_aggrave` | central → commandant | commandement | 2 | PARLEZ | 3 | `lieu` `type` | MISTRAL ICI CENTRAL. URGENT. L’incident du secteur place de la Concorde s’aggrave. Nature : feu de poubelles. Aucun moyen n’est encore engagé. PARLEZ. |
| `incident_echec` | central → commandant | commandement | 1 | TERMINÉ | 3 | `lieu` `type` | MISTRAL ICI CENTRAL. Incident clos sans traitement, secteur place de la Concorde. Nature : feu de poubelles. Je le porte au compte rendu. TERMINÉ. |
| `ordre_eteindre` | commandant → cible | unite | 1 | PARLEZ | 3 | `lieu` `type` | MISTRAL TROIS ICI MISTRAL. Éteignez le feu, secteur place de la Concorde. Nature : feu de poubelles. Porte-extincteur sous la protection des boucliers. PARLEZ. |
| `ordre_secourir` | commandant → cible | unite | 2 | PARLEZ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Allez chercher le blessé, secteur place de la Concorde. Deux boucliers couvrent, deux agents le ramènent derrière la ligne. PARLEZ. |

### Secours

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `secours_demande_pompiers` | unite → central | secours | 2 | PARLEZ | 4 | `lieu` `type` `acces` | CENTRAL ICI MISTRAL DEUX. URGENT. Demande sapeurs-pompiers, secteur place de la Concorde. Nature : feu de poubelles. Accès : rue Saint-Florentin. Je sécurise. PARLEZ. |
| `secours_demande_samu` | unite → central | secours | 2 | PARLEZ | 4 | `lieu` `gravite` `acces` | CENTRAL ICI MISTRAL DEUX. URGENT. Demande SANTÉ sur place, secteur place de la Concorde. Gravité : légère. Accès : rue Saint-Florentin. Je sécurise. PARLEZ. |
| `secours_en_route` | central → unite (réponse) | secours | 1 | TERMINÉ | 3 | `lieu` `duree` | ICI CENTRAL. Secours en route vers le secteur place de la Concorde. Délai : TROIS minutes. Préparez l’accès. TERMINÉ. |
| `secours_attente_securisation` | samu → unite | secours | 2 | PARLEZ | 4 | `lieu` | MISTRAL DEUX ICI SANTÉ UN. Nous sommes arrêtés à la limite de la zone, secteur place de la Concorde. Nous attendons la sécurisation avant d’avancer. PARLEZ. |
| `ordre_proteger_secours` | commandant → cible | unite | 2 | PARLEZ | 3 | `lieu` | MISTRAL TROIS ICI MISTRAL. Protégez les secours, secteur place de la Concorde. Ouvrez un couloir de trois mètres cinquante et tenez-le. PARLEZ. |
| `secours_itineraire_libre` | unite → samu | secours | 1 | TERMINÉ | 3 | `acces` | SANTÉ UN ICI MISTRAL DEUX. Couloir ouvert pour vous, largeur trois mètres cinquante. Accès : rue Saint-Florentin. Zone sécurisée, vous pouvez avancer. TERMINÉ. |
| `secours_sur_place` | samu → central | secours | 1 | TERMINÉ | 3 | `lieu` | CENTRAL ICI SANTÉ UN. Secours sur place, secteur place de la Concorde. Prise en charge en cours. TERMINÉ. |
| `secours_evacuation` | samu → central | secours | 1 | PARLEZ | 3 | `lieu` `gravite` | CENTRAL ICI SANTÉ UN. Victime prise en charge, évacuation en cours depuis le secteur place de la Concorde. Gravité : légère. PARLEZ. |
| `pompiers_feu_eteint` | pompiers → central | secours | 1 | PARLEZ | 3 | `lieu` `type` | CENTRAL ICI SAPEUR UN. Feu éteint, secteur place de la Concorde. Nature : feu de poubelles. Nous surveillons les points chauds. PARLEZ. |
| `secours_termine` | samu → central | secours | 1 | TERMINÉ | 3 | `lieu` | CENTRAL ICI SANTÉ UN. Intervention terminée, secteur place de la Concorde. Nous quittons la zone. TERMINÉ. |

### Circulation et métro

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `ordre_couper_circulation` | commandant → cible | unite | 1 | PARLEZ | 3 | `voie` | MISTRAL TROIS ICI MISTRAL. Coupez la circulation : rue Royale. Barrières et véhicule en travers, déviation des automobilistes. PARLEZ. |
| `rue_fermee` | unite → central | commandement | 1 | PARLEZ | 4 | `voie` | CENTRAL ICI MISTRAL DEUX. Circulation coupée : rue Royale. Barrières posées, déviation en place. PARLEZ. |
| `ordre_rouvrir_circulation` | commandant → cible | unite | 1 | PARLEZ | 3 | `voie` | MISTRAL TROIS ICI MISTRAL. Rouvrez à la circulation : rue Royale. Retirez les barrières et rendez compte. PARLEZ. |
| `rue_rouverte` | unite → central | commandement | 1 | PARLEZ | 3 | `voie` | CENTRAL ICI MISTRAL DEUX. Réouverture effectuée : rue Royale. La circulation reprend. PARLEZ. |
| `perimetre_ferme` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Périmètre fermé à la circulation, secteur place de la Concorde. Nombre de points de fermeture : QUATRE. Déviation en place. PARLEZ. |
| `circulation_danger` | unite → central | commandement | 2 | PARLEZ | 3 | `voie` | CENTRAL ICI MISTRAL DEUX. URGENT. Le cortège arrive sur une voie encore ouverte : rue Royale. Automobilistes en danger, je demande la fermeture. PARLEZ. |
| `station_fermeture_demande` | commandant → central | commandement | 1 | PARLEZ | 3 | `station` | CENTRAL ICI MISTRAL. Je demande la fermeture de la station Concorde. PARLEZ. |
| `station_fermee` | central → tous | commandement | 1 | TERMINÉ | 3 | `station` | TOUTES UNITÉS ICI CENTRAL. Station Concorde fermée à la demande du commandement. Les arrivées se reportent sur les stations voisines. TERMINÉ. |
| `station_reouverture_demande` | commandant → central | commandement | 1 | PARLEZ | 3 | `station` | CENTRAL ICI MISTRAL. Je demande la réouverture de la station Concorde. PARLEZ. |
| `station_rouverte` | central → tous | commandement | 1 | TERMINÉ | 3 | `station` | TOUTES UNITÉS ICI CENTRAL. Station Concorde rouverte. Les voyageurs peuvent de nouveau l’emprunter. TERMINÉ. |
| `metro_arrivee` | unite → central | commandement | 1 | PARLEZ | 4 | `station` `nombre` | CENTRAL ICI MISTRAL DEUX. Arrivées par le métro, station Concorde. Volume de la vague : QUATRE-ZÉRO-ZÉRO. PARLEZ. |
| `metro_flux_deplace` | unite → central | commandement | 1 | PARLEZ | 3 | `station` | CENTRAL ICI MISTRAL DEUX. Report du flux : les arrivées se font maintenant par la station Concorde. PARLEZ. |
| `metro_departs` | unite → central | commandement | 1 | PARLEZ | 3 | `station` | CENTRAL ICI MISTRAL DEUX. Départs par le métro, station Concorde. La foule quitte les lieux par cette bouche. PARLEZ. |
| `ordre_filtrer_station` | commandant → cible | unite | 1 | PARLEZ | 3 | `station` | MISTRAL TROIS ICI MISTRAL. Filtrez la sortie de la station Concorde. Contrôle des arrivants, compte rendu une fois en place. PARLEZ. |
| `sortie_filtree` | unite → central | commandement | 1 | PARLEZ | 3 | `station` | CENTRAL ICI MISTRAL DEUX. Sortie de la station Concorde filtrée. Contrôles en place, flux ralenti. PARLEZ. |

### Moyens spéciaux

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `drone_ordre` | commandant → drone | unite | 1 | PARLEZ | 3 | `lieu` | ICARE ICI MISTRAL. Portez votre observation sur le secteur place de la Concorde. Recherchez les signes de regroupement. PARLEZ. |
| `drone_observation` | drone → central | commandement | 1 | PARLEZ | 4 | `lieu` `nombre` `attitude` | CENTRAL ICI ICARE. Observation, secteur place de la Concorde. Volume : TROIS MILLE. Attitude : calme. PARLEZ. |
| `drone_signalement` | drone → central | commandement | 2 | PARLEZ | 3 | `lieu` `nombre` `vers` | CENTRAL ICI ICARE. Groupe à risque repéré, secteur place de la Concorde. Effectif : QUATRE-ZÉRO. Direction : rue Cambon. PARLEZ. |
| `drone_objectif` | drone → central | commandement | 2 | PARLEZ | 3 | `lieu` `signalement` | CENTRAL ICI ICARE. Objectif désigné, secteur place de la Concorde : auteur de violences, fait filmé. Signalement : veste verte, bonnet noir, sac rouge. PARLEZ. |
| `drone_batterie` | drone → central | commandement | 1 | PARLEZ | 3 | `duree` | CENTRAL ICI ICARE. Batterie basse, retour dans TROIS minutes. Plus de vue aérienne pendant la relève. PARLEZ. |
| `canon_ordre_extinction` | commandant → canon | unite | 1 | PARLEZ | 3 | `lieu` `type` | NEPTUNE UN ICI MISTRAL. Éteignez le feu, secteur place de la Concorde. Nature : feu de poubelles. Extinction seulement, aucun jet sur les personnes. PARLEZ. |
| `canon_ordre_jet` | commandant → canon | unite | 2 | PARLEZ | 3 | `lieu` | NEPTUNE UN ICI MISTRAL. Jet diffus devant la ligne, secteur place de la Concorde, sur mon ordre. Jamais à la tête. PARLEZ. |
| `canon_batterie` | canon → commandant | unite | 1 | PARLEZ | 3 | `lieu` `direction` `litres` | MISTRAL ICI NEPTUNE UN. Canon à eau en position, secteur place de la Concorde, face nord. Cuve : QUATRE MILLE litres. PARLEZ. |
| `canon_feu_eteint` | canon → commandant | unite | 1 | PARLEZ | 3 | `lieu` `litres` | MISTRAL ICI NEPTUNE UN. Feu éteint, secteur place de la Concorde. Il reste QUATRE MILLE litres. PARLEZ. |
| `canon_citerne_basse` | canon → commandant | unite | 2 | PARLEZ | 3 | `eau` | MISTRAL ICI NEPTUNE UN. URGENT. Cuve presque vide, il reste CINQ-ZÉRO-ZÉRO litres. Je demande à me ravitailler en eau. PARLEZ. |
| `centaure_ordre_degager` | commandant → centaure | unite | 1 | PARLEZ | 3 | `lieu` | CENTAURE UN ICI MISTRAL. Vérifiez l’obstacle, puis dégagez la barricade, secteur place de la Concorde. À la lame, à l’allure du pas. PARLEZ. |
| `centaure_ordre_salve` | commandant → centaure | unite | 2 | — | 3 | `lieu` `nombre` | CENTAURE UN ICI MISTRAL. Salve de lacrymogènes, secteur place de la Concorde, tir courbe. Nombre de grenades : UN-DEUX. FAITES L’APERÇU. |
| `centaure_position` | centaure → commandant | unite | 1 | PARLEZ | 3 | `lieu` `direction` | MISTRAL ICI CENTAURE UN. Centaure en position, secteur place de la Concorde, face nord. Lame prête. PARLEZ. |
| `centaure_salve` | centaure → commandant | unite | 1 | PARLEZ | 3 | `lieu` `nombre` | MISTRAL ICI CENTAURE UN. Salve tirée, secteur place de la Concorde. Tir courbe, nombre de grenades : UN-DEUX. PARLEZ. |
| `barricade_degagee` | centaure → commandant | unite | 1 | PARLEZ | 4 | `lieu` | MISTRAL ICI CENTAURE UN. Barricade dégagée, secteur place de la Concorde. Obstacle vérifié puis poussé sur le côté, voie ouverte. PARLEZ. |
| `bravm_ordre` | commandant → bravm | unite | 2 | PARLEZ | 3 | `lieu` `nombre` | FAUCON UN ICI MISTRAL. Groupe auteur de dégradations, secteur place de la Concorde. Effectif : QUATRE-ZÉRO. Interpellez sur fait constaté. PARLEZ. |
| `bravm_en_route` | bravm → commandant (réponse) | unite | 1 | TERMINÉ | 3 | `destination` `duree` | ICI FAUCON UN. REÇU, en route vers le secteur place de la Madeleine. Délai : TROIS minutes. TERMINÉ. |
| `bravm_pied_a_terre` | bravm → commandant | unite | 1 | PARLEZ | 3 | `distance` `lieu` | MISTRAL ICI FAUCON UN. Pied à terre à TROIS-ZÉRO mètres de l’objectif, secteur place de la Concorde. Les machines sont gardées, progression à pied. PARLEZ. |

### Liaison, presse et densité

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `liaison_ordre` | commandant → liaison | unite | 1 | PARLEZ | 3 | `lieu` `demande` | LIAISON ICI MISTRAL. Prenez contact avec les organisateurs, secteur place de la Concorde. Demandez l’arrêt de la tête de cortège. PARLEZ. |
| `liaison_contact` | liaison → commandant | unite | 1 | PARLEZ | 3 | `lieu` | MISTRAL ICI LIAISON. Contact établi avec le service d’ordre du cortège, secteur place de la Concorde. Dialogue en cours. PARLEZ. |
| `liaison_accord` | liaison → commandant | unite | 1 | PARLEZ | 3 | `lieu` `demande` | MISTRAL ICI LIAISON. Accord des organisateurs, secteur place de la Concorde. Ils acceptent l’arrêt de la tête de cortège. PARLEZ. |
| `liaison_refus` | liaison → commandant | unite | 2 | PARLEZ | 3 | `lieu` `demande` | MISTRAL ICI LIAISON. Refus des organisateurs, secteur place de la Concorde. Ils n’acceptent pas l’arrêt de la tête de cortège. PARLEZ. |
| `liaison_dispersion_annoncee` | liaison → commandant | unite | 1 | PARLEZ | 3 | `duree` `issue` | MISTRAL ICI LIAISON. Les organisateurs annoncent la dispersion dans TROIS minutes. Sortie prévue : rue de Rivoli. PARLEZ. |
| `presse_identifiee` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Journalistes identifiés devant le dispositif, secteur place de la Concorde. Nombre : DEUX. Je les laisse passer. PARLEZ. |
| `densite_critique` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Densité critique, secteur place de la Concorde. Plus de quatre personnes au mètre carré, il faut ouvrir une issue. PARLEZ. |
| `issue_ouverte` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` `issue` | CENTRAL ICI MISTRAL DEUX. Issue ouverte, secteur place de la Concorde : rue de Rivoli. La foule peut s’écouler. PARLEZ. |
| `densite_normale` | unite → central | commandement | 1 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. Densité revenue à la normale, secteur place de la Concorde. Plus de risque de compression. PARLEZ. |
| `bousculade` | unite → central | commandement | 2 | PARLEZ | 3 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Mouvement de foule, secteur place de la Concorde. Personnes au sol, je suspends toute manœuvre et je demande SANTÉ. PARLEZ. |

### Fin de mission

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `debut_mission` | commandant → tous | unite | 1 | TERMINÉ | 3 | `heure` `lieu` | TOUTES UNITÉS ICI MISTRAL. Début de la mission à UNE-SEPT heures ZÉRO-QUATRE. Chacun à son poste, secteur place de la Concorde. TERMINÉ. |
| `bilan_force` | unite → central | commandement | 1 | PARLEZ | 3 | `nombre` `lanceur` `lbd` `indisponibles` `interpelles` | CENTRAL ICI MISTRAL DEUX. Consommation. Lacrymogènes à main : UN-DEUX. Au lanceur : SIX. Tirs de lanceur de balles de défense : ZÉRO. Agents blessés : UN. Interpellés : DEUX. PARLEZ. |
| `fin_mission` | unite → central | commandement | 1 | PARLEZ | 3 | `heure` `lieu` | CENTRAL ICI MISTRAL DEUX. Fin de mission à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Dispersion terminée, plus aucun trouble. PARLEZ. |
| `retour_base` | unite → central | commandement | 1 | PARLEZ | 4 |  | CENTRAL ICI MISTRAL DEUX. Retour au cantonnement. Embarquement terminé, véhicules en colonne. PARLEZ. |

### Ambiance

| Clé | De → à | Canal | Prio | Fin | Var. | Paramètres | Exemple |
|---|---|---|---|---|---|---|---|
| `ambiance_ras` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Rien à signaler, secteur place de la Concorde. TERMINÉ. |
| `ambiance_rassemblement` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` `nombre` | MISTRAL ICI MISTRAL DEUX. Le rassemblement se constitue, secteur place de la Concorde. Volume : TROIS MILLE. TERMINÉ. |
| `ambiance_cortege` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` `nombre` | MISTRAL ICI MISTRAL DEUX. Le cortège avance, secteur place de la Concorde. Volume : TROIS MILLE, rien d’anormal. TERMINÉ. |
| `ambiance_slogans` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Slogans repris en chœur, secteur place de la Concorde. Ambiance bon enfant. TERMINÉ. |
| `ambiance_vigilance` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Ambiance qui se tend un peu, secteur place de la Concorde. Je reste vigilant. TERMINÉ. |
| `ambiance_tension` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Tension palpable, secteur place de la Concorde. Groupes déterminés devant la ligne. TERMINÉ. |
| `ambiance_affrontement` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Affrontements en cours, secteur place de la Concorde. La ligne tient. TERMINÉ. |
| `ambiance_dispersion` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` `nombre` | MISTRAL ICI MISTRAL DEUX. La dispersion se poursuit, secteur place de la Concorde. Volume restant : TROIS MILLE. TERMINÉ. |
| `ambiance_groupes_mobiles` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Petits groupes mobiles dans les rues adjacentes, secteur place de la Concorde. Je les suis à distance. TERMINÉ. |
| `ambiance_apres` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Calme revenu, secteur place de la Concorde. Reconnaissance des abords en cours. TERMINÉ. |
| `ambiance_logistique` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Eau distribuée aux agents, secteur place de la Concorde. TERMINÉ. |
| `ambiance_circulation` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Circulation déviée aux abords, secteur place de la Concorde. Les déviations tiennent. TERMINÉ. |
| `ambiance_foyers` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Fumée noire visible, secteur place de la Concorde. Un feu est en cours sur la voie publique. TERMINÉ. |
| `ambiance_secours_veille` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Secours en attente, secteur place de la Concorde. Prêts à intervenir sur demande. TERMINÉ. |
| `ambiance_presse` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` | MISTRAL ICI MISTRAL DEUX. Journalistes au contact du dispositif, secteur place de la Concorde. Tout est filmé. TERMINÉ. |
| `ambiance_effectif` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` `nombre` | MISTRAL ICI MISTRAL DEUX. Point d’effectif, secteur place de la Concorde. Nombre d’agents aptes : UN-QUATRE. TERMINÉ. |
| `ambiance_heure` | central → tous | commandement | 0 | TERMINÉ | 5 | `heure` | TOUTES UNITÉS ICI CENTRAL. Il est UNE-SEPT heures ZÉRO-QUATRE. Point horaire. TERMINÉ. |
| `ambiance_meteo` | unite → commandant | unite | 0 | TERMINÉ | 5 | `lieu` `meteo` | MISTRAL ICI MISTRAL DEUX. Météo, secteur place de la Concorde : ciel couvert, vent d’ouest. Les agents adaptent leur équipement. TERMINÉ. |
