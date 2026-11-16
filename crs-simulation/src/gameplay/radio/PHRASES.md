# Radio — bibliothèque de phrases

152 situations, de 3 à 5 variantes chacune. Fichier généré d'après `phrases/*.ts` : en cas de doute, le code fait foi.

## Utilisation

```ts
const phrases = ctx.require<RadioPhrases>('radio.phrases');   // import { RADIO_PHRASES_SERVICE } from '@/gameplay/radio'
phrases.say('prise_position', { lieu: 'place de la Concorde', direction: 'nord' }, { squad });
phrases.say('agent_a_terre', {}, { squad, priority: 2 });
phrases.text('sommation_premiere', { heure: 17.07 });   // texte seul, variante 0 (ou 3e argument = indice)
```

- Tous les paramètres sont facultatifs : une valeur par défaut garantit une phrase correcte et sans accolade.
- `say(clé, params, options)` retourne `false` si la clé est inconnue ou si le message est écarté (anti-répétition, file saturée).
- Options : `squad` (indicatif de l'émetteur + secteur déduit de la position du chef), `at` (position pour nommer le secteur), `personId`, `from` (indicatif imposé), `channel`, `priority`, `variant`.
- Un nombre fourni en paramètre est dit à la radio, chiffre par chiffre (`45` → « QUATRE-CINQ », `5000` → « CINQ MILLE »). Une chaîne est reprise telle quelle.
- `{unite}` et `{cible}` sont des indicatifs (`MISTRAL 2` est dit « MISTRAL DEUX »). `{heure}` : nombre 0..24 ou texte ; absent = heure de la session.
- `{lieu}` absent : le secteur est déduit de `options.squad` / `options.at` / `options.personId` par `ctx.world.sectorName`. Les phrases écrivent toujours « secteur {lieu} ».
- Forme du message : `APPELÉ ICI APPELANT. Corps. PARLEZ.` (ou `TERMINÉ.`, ou sans formule de fin quand le corps se termine par « Faites l'aperçu » ou « Collationnez »).
- Les situations `ambiance_*` (priorité 0) sont émises par le générateur d'ambiance ; les autres modules n'ont pas à les employer.

## Paramètres

| Paramètre | Sens | Valeur par défaut |
|---|---|---|
| `unite` | indicatif de l'émetteur (ou de l'unité visée) | compagnie |
| `cible` | indicatif du destinataire / de l'unité désignée | compagnie |
| `lieu` | nom du secteur (« place de la Concorde ») | déduit de la position, sinon « courant » |
| `voie` | rue ou itinéraire | « voie concernée » |
| `station` | station de métro | « concernée » |
| `direction` | point cardinal ou direction | « nord » |
| `nombre`, `reste`, `indisponibles`, `interpelles`, `effectif` | quantités | « plusieurs », « peu de », « aucun », « complet » |
| `distance`, `duree`, `litres`, `pct` | mesures | « quelques dizaines de », « quelques », « plusieurs milliers de », « moins de cinquante » |
| `moyen`, `nature`, `attitude`, `gravite`, `type`, `objet`, `mission`, `limite`, `niveau`, `meteo` | libellés | voir `phrases/defaults.ts` |
| `heure` | heure dite à la radio | heure de la session |

## Situations

### Contrôle et mise en place

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `radio_controle` | unite → central | unite | 1 |  | CENTRAL ICI MISTRAL DEUX. Contrôle radio. PARLEZ. |
| `radio_controle_reponse` | central → unite | commandement | 1 |  | MISTRAL DEUX ICI CENTRAL. Fort et clair. TERMINÉ. |
| `stationnement` | unite → central | unite | 1 | `lieu` `effectif` `nombre` | CENTRAL ICI MISTRAL DEUX. Compagnie en zone de stationnement, secteur place de la Concorde. Effectif à pied : complet, fourgons : UN-DEUX. Prêt. PARLEZ. |
| `mission_donnee` | central → unite | commandement | 1 | `mission` `lieu` | MISTRAL DEUX ICI CENTRAL. Mission : tenir le dispositif. Secteur place de la Concorde. Faites l’aperçu. |
| `mission_apercu` | unite → central | commandement | 1 | `mission` | CENTRAL ICI MISTRAL DEUX. Aperçu. TERMINÉ. |
| `dispositif_en_place` | unite → central | unite | 1 | `lieu` `direction` `nombre` | CENTRAL ICI MISTRAL DEUX. Dispositif en place, secteur place de la Concorde, face nord. Sections en ligne : UN-DEUX, véhicules en travers. Prêt. PARLEZ. |
| `prise_position` | unite → central | unite | 1 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. En position, secteur place de la Concorde, face nord. PARLEZ. |
| `mouvement` | unite → central | unite | 1 | `lieu` `moyen` | CENTRAL ICI MISTRAL DEUX. En mouvement vers le secteur place de la Concorde. Déplacement à pied. PARLEZ. |
| `arrivee_zone` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Arrivé sur le secteur place de la Concorde. Mise en place en cours. PARLEZ. |
| `embarquement` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Embarquement en cours, destination : secteur place de la Concorde. PARLEZ. |
| `debarquement` | unite → central | unite | 1 | `lieu` `distance` | CENTRAL ICI MISTRAL DEUX. Débarquement en cours, secteur place de la Concorde, à TROIS-ZÉRO mètres de la foule. PARLEZ. |
| `ordre_tenir` | commandant → cible | unite | 1 | `lieu` `direction` | MISTRAL ICI MISTRAL ZÉRO. Tenez le secteur place de la Concorde, face nord. Riposte directe seulement. PARLEZ. |

### Compte rendu de situation

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `cortege_approche` | unite → central | unite | 1 | `distance` `lieu` `nature` `nombre` `attitude` | CENTRAL ICI MISTRAL DEUX. Tête de cortège à TROIS-ZÉRO mètres, secteur place de la Concorde. Nature : cortège déclaré. Volume : UN-DEUX. Attitude : calme. PARLEZ. |
| `foule_calme` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Foule calme, secteur place de la Concorde. Volume : UN-DEUX, service d’ordre du cortège présent. PARLEZ. |
| `foule_croissante` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. L’affluence grossit, secteur place de la Concorde. Volume estimé : UN-DEUX. PARLEZ. |
| `foule_tendue` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Attitude tendue en tête, secteur place de la Concorde. Volume : UN-DEUX, premières invectives vers la ligne. PARLEZ. |
| `foule_hostile` | unite → central | unite | 2 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Foule hostile, secteur place de la Concorde. Volume : UN-DEUX, groupes déterminés au contact de la ligne. PARLEZ. |
| `situation_ras` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Rien à signaler, secteur place de la Concorde. Situation calme. PARLEZ. |
| `situation_tendue` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Situation tendue, secteur place de la Concorde. Je reste en vigilance et je garde la réserve proche. PARLEZ. |
| `situation_degradee` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Situation dégradée, secteur place de la Concorde. Violences en cours, je demande votre appui. PARLEZ. |
| `situation_apaisee` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Retour au calme, secteur place de la Concorde. Plus aucun jet, la foule s’éloigne. PARLEZ. |
| `cortege_arrete` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Cortège à l’arrêt, secteur place de la Concorde. Tête immobilisée, volume : UN-DEUX. PARLEZ. |

### Signes avant-coureurs

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `signe_changement_tenue` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Individus qui se changent à couvert, secteur place de la Concorde. Tenues sombres et sacs ouverts, groupe de UN-DEUX personnes. PARLEZ. |
| `signe_bloc` | unite → central | unite | 2 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Un bloc se forme, secteur place de la Concorde. Banderole renforcée en tête, effectif : UN-DEUX. PARLEZ. |
| `signe_depavage` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. Chaussée dépavée, secteur place de la Concorde. Des projectiles sont constitués au sol. PARLEZ. |
| `signe_parapluies` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Parapluies ouverts en tête, secteur place de la Concorde. Ils masquent une action : bloc compact de UN-DEUX personnes. PARLEZ. |
| `signe_visages_couverts` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Visages qui se couvrent, secteur place de la Concorde. Personnes masquées devant la banderole : UN-DEUX. PARLEZ. |
| `signe_projectiles_reunis` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. Réserve de projectiles constituée, secteur place de la Concorde. Bouteilles et pierres rassemblées derrière le premier rang. PARLEZ. |
| `signe_fumigenes` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Fumigènes allumés en tête, secteur place de la Concorde. Fumée dense, visibilité réduite. PARLEZ. |
| `signe_materiel_voie` | unite → central | unite | 1 | `lieu` `objet` | CENTRAL ICI MISTRAL DEUX. Mobilier tiré en travers de la voie, secteur place de la Concorde. Poubelles et barrières ramenées au milieu de la chaussée. PARLEZ. |

### Violences et jets

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `jets_projectiles` | unite → central | unite | 2 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Jets de projectiles sur la ligne, secteur place de la Concorde. Bouteilles et pavés depuis la foule, refus de reculer. PARLEZ. |
| `jets_mortiers` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tirs de mortiers d’artifice sur la ligne, secteur place de la Concorde. Tir tendu depuis la foule, je mets en protection. PARLEZ. |
| `jets_incendiaires` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. Engins incendiaires lancés sur la ligne, secteur place de la Concorde. Flammes sur la chaussée, je m’écarte et j’éteins. PARLEZ. |
| `jets_cesses` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Les jets ont cessé, secteur place de la Concorde. La foule recule d’une trentaine de mètres. PARLEZ. |
| `assaut_ligne` | unite → central | unite | 2 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Assaut sur la ligne, secteur place de la Concorde. Groupe organisé de UN-DEUX personnes au contact, coups et jets. PARLEZ. |
| `violences_unite` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. Violences sur l’unité, secteur place de la Concorde. J’emploie la force d’initiative, cadre violences et voies de fait. Avertissement fait à la foule. PARLEZ. |
| `retour_gaz` | unite → central | unite | 2 | `lieu` `distance` | CENTRAL ICI MISTRAL DEUX. Retour de gaz sur la ligne, secteur place de la Concorde. Vent de face, je suspends les tirs et je fais mettre les masques. PARLEZ. |
| `degradations` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Dégradations en cours, secteur place de la Concorde. Vitrines brisées, groupe de UN-DEUX personnes. PARLEZ. |

### Agents et blessés

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `agent_blesse` | unite → central | unite | 2 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Un agent blessé, secteur place de la Concorde. Gravité : léger. Il est pris en charge à l’arrière de la ligne. PARLEZ. |
| `agent_a_terre` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Agent à terre, secteur place de la Concorde. Il est encerclé par la foule, je lance le dégagement. PARLEZ. |
| `agent_degage` | unite → central | unite | 1 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. Agent dégagé, secteur place de la Concorde. Pris en charge par le secouriste, état : léger. PARLEZ. |
| `agent_isole` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Agent isolé, secteur place de la Concorde. Coupé de son groupe, pris à partie par la foule. PARLEZ. |
| `civil_blesse` | unite → central | unite | 2 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Un manifestant blessé, secteur place de la Concorde. Gravité : léger. Je sécurise et je demande les secours. PARLEZ. |
| `bilan_effectif` | unite → central | unite | 1 | `nombre` `indisponibles` | CENTRAL ICI MISTRAL DEUX. Point d’effectif : UN-DEUX agents disponibles, hors de combat : aucun. PARLEZ. |

### Renforts, munitions et relèves

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `demande_renfort` | unite → central | unite | 2 | `lieu` `nombre` `direction` | CENTRAL ICI MISTRAL DEUX. URGENT. Je demande du renfort, secteur place de la Concorde. Ligne sous pression, besoin de UN-DEUX agents supplémentaires. PARLEZ. |
| `renfort_accorde` | central → unite | commandement | 1 | `cible` `lieu` | MISTRAL DEUX ICI CENTRAL. Renfort accordé : MISTRAL est en route vers le secteur place de la Concorde. TERMINÉ. |
| `renfort_arrive` | unite → central | unite | 1 | `lieu` `cible` | CENTRAL ICI MISTRAL DEUX. Renfort arrivé, secteur place de la Concorde. Je l’intègre à la ligne. PARLEZ. |
| `munitions_basses` | unite → central | unite | 1 | `pct` `reste` | CENTRAL ICI MISTRAL DEUX. Munitions basses : lacrymogènes à moins de cinquante pour cent. Réapprovisionnement à prévoir. PARLEZ. |
| `munitions_epuisees` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Plus de grenades lacrymogènes. Je demande un ravitaillement immédiat, secteur place de la Concorde. PARLEZ. |
| `ravitaillement_demande` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Demande de ravitaillement : grenades, eau et masques, secteur place de la Concorde. PARLEZ. |
| `ravitaillement_effectue` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Ravitaillement effectué, secteur place de la Concorde. Dotation de nouveau complète. PARLEZ. |
| `releve_demande` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Demande de relève, secteur place de la Concorde. La section tient la ligne depuis trop longtemps, fatigue marquée. PARLEZ. |
| `releve_ordonnee` | commandant → cible | unite | 1 | `unite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Relevez MISTRAL DEUX sur place, secteur place de la Concorde. Passage de ligne. PARLEZ. |
| `releve_en_cours` | unite → central | unite | 1 | `lieu` `unite` | CENTRAL ICI MISTRAL DEUX. Relève en cours, secteur place de la Concorde. Passage de ligne, MISTRAL DEUX se replie vers les véhicules. PARLEZ. |
| `releve_effectuee` | unite → central | unite | 1 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Relève effectuée, secteur place de la Concorde. La section relevée récupère aux véhicules. PARLEZ. |

### Sommations et emploi de la force

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `sommation_annonce` | commandant → central | commandement | 2 | `lieu` | CENTRAL ICI MISTRAL ZÉRO. Je constate l’attroupement, secteur place de la Concorde, et je procède à l’annonce. Aucun emploi de la force avant mon ordre. PARLEZ. |
| `sommation_premiere` | commandant → central | commandement | 2 | `heure` `lieu` `voie` | CENTRAL ICI MISTRAL ZÉRO. Première sommation faite à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Issue ouverte : rue Royale. PARLEZ. |
| `sommation_derniere` | commandant → central | commandement | 2 | `heure` `lieu` `voie` | CENTRAL ICI MISTRAL ZÉRO. Dernière sommation faite à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Issue ouverte : rue Royale. Emploi de la force possible à l’issue du délai. PARLEZ. |
| `sommations_effectuees` | commandant → central | commandement | 2 | `lieu` `voie` `heure` | CENTRAL ICI MISTRAL ZÉRO. Sommations effectuées, secteur place de la Concorde. Annonce, première et dernière sommation faites, issue ouverte : rue Royale. TERMINÉ. |
| `force_niveau_0` | commandant → cible | unite | 2 | `lieu` | MISTRAL ICI MISTRAL ZÉRO. Aucun emploi de la force. Gardez la distance, pas de contact, pas de tir. TERMINÉ. |
| `force_niveau_1` | commandant → cible | unite | 2 | `limite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Emploi de la force autorisé : présence et contact seulement. Refoulement au bouclier, limite : ligne actuelle. Faites l’aperçu. |
| `force_niveau_2` | commandant → cible | unite | 2 | `limite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Emploi de la force autorisé : bâton de défense et gazeuse à main. Limite : ligne actuelle. Faites l’aperçu. |
| `force_niveau_3` | commandant → cible | unite | 2 | `limite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Emploi de la force autorisé : lacrymogènes à main et au lanceur, canon à eau. Limite : ligne actuelle. Faites l’aperçu. |
| `force_niveau_4` | commandant → cible | unite | 2 | `limite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Usage des armes autorisé : grenades de désencerclement et lanceur de balles de défense, objectif désigné. Limite : ligne actuelle. Collationnez. |
| `force_niveau_5` | commandant → cible | unite | 2 | `lieu` | MISTRAL ICI MISTRAL ZÉRO. Légitime défense seule : arme de service autorisée uniquement contre une menace vitale et immédiate. Collationnez. |
| `force_apercu` | unite → commandant | commandement | 1 | `limite` | MISTRAL ZÉRO ICI MISTRAL DEUX. Aperçu. Je collationne : emploi de la force autorisé, limite : ligne actuelle. TERMINÉ. |
| `force_suspendue` | commandant → tous | commandement | 2 | `lieu` | TOUTES UNITÉS ICI MISTRAL ZÉRO. Halte à l’emploi de la force : le trouble a cessé. Reprise de la posture de contact. TERMINÉ. |

### Manœuvres

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `gaz_main` | commandant → cible | unite | 1 | `lieu` `direction` | MISTRAL ICI MISTRAL ZÉRO. Lacrymogènes à main sur le carrefour, secteur place de la Concorde. Sur mon ordre. PARLEZ. |
| `gaz_lanceur` | commandant → cible | unite | 1 | `lieu` `distance` | MISTRAL ICI MISTRAL ZÉRO. Lanceurs, tir courbe sur le secteur place de la Concorde, portée TROIS-ZÉRO mètres. Sur mon ordre. PARLEZ. |
| `gaz_suspendu` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tirs de gaz suspendus, secteur place de la Concorde. Le vent rabat les nuages vers la ligne. PARLEZ. |
| `bond_offensif` | commandant → cible | unite | 1 | `distance` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Bond offensif, TROIS-ZÉRO mètres en avant, puis halte et réalignement. PARLEZ. |
| `bond_realigne` | unite → central | unite | 1 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Bond effectué, secteur place de la Concorde. Ligne réalignée, boucliers jointifs. PARLEZ. |
| `charge` | commandant → cible | unite | 2 | `lieu` `distance` | MISTRAL ICI MISTRAL ZÉRO. Chargez jusqu’au secteur place de la Concorde, arrêt au sifflet. Distance : TROIS-ZÉRO mètres. PARLEZ. |
| `charge_arretee` | unite → central | unite | 1 | `lieu` `distance` | CENTRAL ICI MISTRAL DEUX. Charge terminée, secteur place de la Concorde. Arrêt au sifflet, repli au pas sur la ligne de départ. PARLEZ. |
| `repli` | commandant → cible | unite | 1 | `lieu` | MISTRAL ICI MISTRAL ZÉRO. Rompez le contact, repli par échelons sur la ligne des véhicules. TERMINÉ. |
| `repli_effectue` | unite → central | unite | 1 | `lieu` `distance` | CENTRAL ICI MISTRAL DEUX. Repli effectué, secteur place de la Concorde. Dispositif reformé, effectif au complet. PARLEZ. |
| `encerclement_ordre` | commandant → cible | unite | 1 | `lieu` | MISTRAL ICI MISTRAL ZÉRO. Bouclage de l’îlot, secteur place de la Concorde. Sortie contrôlée, annonce aux personnes retenues toutes les minutes. PARLEZ. |
| `encerclement_en_place` | unite → central | unite | 1 | `lieu` `direction` `nombre` | CENTRAL ICI MISTRAL DEUX. Encerclement en place, secteur place de la Concorde. Une issue contrôlée côté nord, densité surveillée. PARLEZ. |
| `refoulement` | commandant → cible | unite | 1 | `direction` `limite` `lieu` | MISTRAL ICI MISTRAL ZÉRO. Refoulement, axe nord, limite : ligne actuelle, par bonds de cinquante mètres. Issue libre devant la foule. PARLEZ. |
| `tortue` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tortue formée, secteur place de la Concorde. Boucliers de face et au-dessus des têtes, plus aucun tir possible. PARLEZ. |
| `ligne_formee` | unite → central | unite | 1 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Ligne formée, secteur place de la Concorde, face nord. Boucliers jointifs, deuxième rang en place. PARLEZ. |
| `dispersion_en_cours` | unite → central | unite | 1 | `lieu` `direction` `nombre` | CENTRAL ICI MISTRAL DEUX. Dispersion en cours, secteur place de la Concorde. La foule reflue vers nord, je maintiens la pression. PARLEZ. |
| `dispersion_effectuee` | unite → central | unite | 1 | `lieu` `heure` | CENTRAL ICI MISTRAL DEUX. Dispersion effective, chaussée libre, secteur place de la Concorde. Fin de l’emploi de la force à UNE-SEPT heures ZÉRO-QUATRE. PARLEZ. |

### Interpellations

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `interpellation_ordre` | commandant → cible | unite | 1 | `lieu` | MISTRAL ICI MISTRAL ZÉRO. Interpellez sur fait constaté : l’individu désigné, secteur place de la Concorde. Objectif désigné par le drone. PARLEZ. |
| `interpellation_en_cours` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Interpellation en cours, secteur place de la Concorde. Un individu maîtrisé, menottage en cours. PARLEZ. |
| `interpellation_effectuee` | unite → central | unite | 1 | `heure` `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Interpellé : un individu pour jet de projectile sur agents, à UNE-SEPT heures ZÉRO-QUATRE. Fait filmé, conduit au point de regroupement. PARLEZ. |
| `interpelle_conduit` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Un interpellé est conduit au point de regroupement, secteur place de la Concorde. Escorte de deux agents. PARLEZ. |
| `remise_interpelle` | unite → central | unite | 1 | `heure` `nombre` | CENTRAL ICI MISTRAL DEUX. Remise des interpellés à l’officier de police judiciaire, à UNE-SEPT heures ZÉRO-QUATRE. Individus remis : UN-DEUX. PARLEZ. |

### Incidents

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `incident_feu` | unite → central | commandement | 2 | `lieu` `type` | CENTRAL ICI MISTRAL DEUX. URGENT. Feu signalé, secteur place de la Concorde. Nature : incident à traiter. Je demande une unité pour l’éteindre. PARLEZ. |
| `incident_blesse` | unite → central | commandement | 2 | `lieu` `gravite` | CENTRAL ICI MISTRAL DEUX. URGENT. Blessé à aller chercher, secteur place de la Concorde. Gravité : léger. Besoin d’une équipe pour l’extraire. PARLEZ. |
| `incident_pillage` | unite → central | commandement | 2 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Pillage en cours, secteur place de la Concorde. Boutique visée, effectif : UN-DEUX. Je demande une unité mobile. PARLEZ. |
| `incident_barricade` | unite → central | commandement | 1 | `lieu` `objet` | CENTRAL ICI MISTRAL DEUX. Barricade signalée, secteur place de la Concorde. Matériaux : divers. Obstacle à dégager. PARLEZ. |
| `incident_automobiliste` | unite → central | commandement | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Automobiliste bloqué au milieu de la foule, secteur place de la Concorde. Il est pris à partie, besoin d’une escorte. PARLEZ. |
| `incident_secours_bloques` | unite → central | commandement | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Secours empêchés d’avancer, secteur place de la Concorde. Voie obstruée, il faut ouvrir un couloir. PARLEZ. |
| `incident_delegue` | commandant → cible | unite | 1 | `lieu` `type` `niveau` `cible` | MISTRAL ICI MISTRAL ZÉRO. Je vous confie l’incident, secteur place de la Concorde : incident à traiter. Vous y allez, vous rendez compte. PARLEZ. |
| `incident_accuse` | unite → commandant | unite | 1 | `lieu` `duree` | MISTRAL ZÉRO ICI MISTRAL DEUX. Aperçu, je prends l’incident, secteur place de la Concorde. TERMINÉ. |
| `incident_traite` | unite → commandant | unite | 1 | `lieu` `type` | MISTRAL ZÉRO ICI MISTRAL DEUX. Incident traité, secteur place de la Concorde. Nature : incident à traiter. Retour à ma position. PARLEZ. |
| `incident_aggrave` | central → unite | commandement | 2 | `lieu` `type` | MISTRAL DEUX ICI CENTRAL. URGENT. L’incident du secteur place de la Concorde s’aggrave : incident à traiter. Il faut agir sans attendre. PARLEZ. |
| `incident_echec` | central → unite | commandement | 1 | `lieu` `type` | MISTRAL DEUX ICI CENTRAL. L’incident du secteur place de la Concorde n’a pas pu être traité. Nature : incident à traiter. Il est abandonné. PARLEZ. |

### Secours

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `secours_demande_pompiers` | unite → central | secours | 2 | `lieu` `type` `voie` | CENTRAL ICI MISTRAL DEUX. URGENT. Je demande les pompiers, secteur place de la Concorde. Nature : incident à traiter. Accès par rue Royale. PARLEZ. |
| `secours_demande_samu` | unite → central | secours | 2 | `lieu` `gravite` `voie` | CENTRAL ICI MISTRAL DEUX. URGENT. Je demande SANTÉ sur place, secteur place de la Concorde. Blessé : léger. Je sécurise. PARLEZ. |
| `secours_en_route` | central → unite | secours | 1 | `lieu` `duree` `cible` `voie` | MISTRAL DEUX ICI CENTRAL. Les secours sont en route vers le secteur place de la Concorde. Arrivée dans quelques minutes. TERMINÉ. |
| `secours_attente_securisation` | samu → unite | secours | 2 | `lieu` | MISTRAL DEUX ICI SANTÉ UN. Nous sommes à la limite de la zone, secteur place de la Concorde. Nous attendons la sécurisation avant d’avancer. PARLEZ. |
| `secours_itineraire_libre` | unite → samu | secours | 1 | `voie` `lieu` | SANTÉ UN ICI MISTRAL DEUX. Couloir pour SANTÉ, axe rue Royale, largeur de trois mètres cinquante, zone sécurisée. Vous pouvez avancer. TERMINÉ. |
| `secours_sur_place` | samu → unite | secours | 1 | `lieu` | MISTRAL DEUX ICI SANTÉ UN. Secours sur place, secteur place de la Concorde. Prise en charge en cours. TERMINÉ. |
| `secours_evacuation` | samu → central | secours | 1 | `lieu` `gravite` | CENTRAL ICI SANTÉ UN. Victime prise en charge, évacuation en cours depuis le secteur place de la Concorde. Gravité : léger. PARLEZ. |
| `secours_termine` | samu → central | secours | 1 | `lieu` | CENTRAL ICI SANTÉ UN. Intervention terminée, secteur place de la Concorde. Les secours quittent la zone. TERMINÉ. |

### Circulation et métro

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `rue_fermee` | unite → central | unite | 1 | `voie` | CENTRAL ICI MISTRAL DEUX. Circulation coupée, rue Royale. Barrières posées, déviation en place. PARLEZ. |
| `rue_rouverte` | unite → central | unite | 1 | `voie` | CENTRAL ICI MISTRAL DEUX. Réouverture de la voie : rue Royale. La circulation reprend. PARLEZ. |
| `perimetre_ferme` | unite → central | unite | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Périmètre fermé, secteur place de la Concorde. Accès filtrés sur UN-DEUX points, déviation en place. PARLEZ. |
| `station_fermee` | central → tous | commandement | 1 | `station` | TOUTES UNITÉS ICI CENTRAL. Fermeture de la station Concorde, à la demande du commandement. Les flux sont reportés sur les stations voisines. PARLEZ. |
| `station_rouverte` | central → tous | commandement | 1 | `station` | TOUTES UNITÉS ICI CENTRAL. Réouverture de la station Concorde. Les voyageurs peuvent de nouveau l’emprunter. PARLEZ. |
| `metro_arrivee` | unite → central | unite | 1 | `station` `nombre` `lieu` | CENTRAL ICI MISTRAL DEUX. Arrivée de manifestants par le métro, station Concorde. Une vague de UN-DEUX personnes sort sur le secteur place de la Concorde. PARLEZ. |
| `metro_flux_deplace` | unite → central | unite | 1 | `station` `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. La fermeture a déplacé le flux : les arrivées se font maintenant par la station Concorde, secteur place de la Concorde. PARLEZ. |
| `sortie_filtree` | unite → central | unite | 1 | `station` `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Sortie de la station Concorde filtrée, secteur place de la Concorde. Contrôles à la sortie, flux ralenti. PARLEZ. |

### Moyens spéciaux

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `drone_observation` | drone → central | commandement | 1 | `nombre` `lieu` `attitude` `direction` | CENTRAL ICI ICARE. Observation : UN-DEUX personnes devant la banderole, secteur place de la Concorde. Attitude : calme. PARLEZ. |
| `drone_signalement` | drone → central | commandement | 2 | `lieu` `nombre` `direction` | CENTRAL ICI ICARE. Objectif repéré, secteur place de la Concorde. Individu en tenue sombre, auteur de jets sur la ligne. PARLEZ. |
| `drone_batterie` | drone → central | commandement | 1 | `duree` `lieu` | CENTRAL ICI ICARE. Batterie basse, retour à la base dans quelques minutes. Je demande la relève du drone. PARLEZ. |
| `canon_batterie` | canon → commandant | unite | 1 | `lieu` `direction` `litres` | MISTRAL ZÉRO ICI NEPTUNE UN. Canon à eau en batterie, secteur place de la Concorde, face nord. Réserve : plusieurs milliers de litres. PARLEZ. |
| `canon_feu_eteint` | canon → commandant | unite | 1 | `lieu` `litres` | MISTRAL ZÉRO ICI NEPTUNE UN. Feu éteint, secteur place de la Concorde. Jet diffus maintenu devant la ligne, il reste plusieurs milliers de litres. PARLEZ. |
| `canon_citerne_basse` | canon → commandant | unite | 2 | `litres` | MISTRAL ZÉRO ICI NEPTUNE UN. URGENT. Citerne presque vide, il reste plusieurs milliers de litres. Je demande un ravitaillement en eau. PARLEZ. |
| `centaure_position` | centaure → commandant | unite | 1 | `lieu` `direction` | MISTRAL ZÉRO ICI CENTAURE UN. Centaure en position, secteur place de la Concorde. Obstacle vérifié, personne derrière. PARLEZ. |
| `centaure_salve` | centaure → commandant | unite | 1 | `lieu` `nombre` | MISTRAL ZÉRO ICI CENTAURE UN. Salve tirée, secteur place de la Concorde. Tir courbe de UN-DEUX grenades, zone carrefour. PARLEZ. |
| `barricade_degagee` | centaure → commandant | unite | 1 | `lieu` | MISTRAL ZÉRO ICI CENTAURE UN. Barricade dégagée, secteur place de la Concorde. Obstacle poussé sur le côté, voie ouverte. PARLEZ. |

### Liaison, presse et densité

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `liaison_contact` | liaison → central | commandement | 1 | `lieu` | CENTRAL ICI LIAISON. Contact établi avec le service d’ordre du cortège, secteur place de la Concorde. Ils acceptent le dialogue. PARLEZ. |
| `liaison_accord` | liaison → central | commandement | 1 | `duree` `voie` `lieu` | CENTRAL ICI LIAISON. Les organisateurs annoncent la dispersion dans quelques minutes, sortie par rue Royale. PARLEZ. |
| `liaison_refus` | liaison → central | commandement | 2 | `lieu` `direction` | CENTRAL ICI LIAISON. Les organisateurs refusent de modifier le parcours, secteur place de la Concorde. Le cortège avance malgré l’interdiction. PARLEZ. |
| `presse_identifiee` | unite → central | commandement | 1 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Journalistes identifiés devant le cordon, secteur place de la Concorde. Effectif : UN-DEUX, ils demandent à passer. Je les laisse passer. PARLEZ. |
| `densite_critique` | unite → central | unite | 2 | `lieu` `direction` `distance` | CENTRAL ICI MISTRAL DEUX. URGENT. Densité critique devant le barrage, secteur place de la Concorde. Plus de quatre personnes au mètre carré, aucune issue ouverte. PARLEZ. |
| `densite_normale` | unite → central | unite | 1 | `lieu` `direction` | CENTRAL ICI MISTRAL DEUX. Densité revenue à la normale, secteur place de la Concorde. Issues dégagées, plus aucun risque de compression. PARLEZ. |
| `bousculade` | unite → central | unite | 2 | `lieu` | CENTRAL ICI MISTRAL DEUX. URGENT. Mouvement de foule, secteur place de la Concorde. Bousculade grave, personnes au sol, je suspends toute manœuvre. PARLEZ. |

### Fin de mission

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `debut_mission` | commandant → tous | commandement | 1 | `heure` `lieu` | TOUTES UNITÉS ICI MISTRAL ZÉRO. Début de la mission à UNE-SEPT heures ZÉRO-QUATRE. Chacun à son poste, secteur place de la Concorde. TERMINÉ. |
| `fin_mission` | unite → central | commandement | 1 | `heure` `lieu` | CENTRAL ICI MISTRAL DEUX. Fin de mission à UNE-SEPT heures ZÉRO-QUATRE, secteur place de la Concorde. Dispersion terminée, plus aucun trouble. PARLEZ. |
| `bilan_force` | unite → central | commandement | 1 | `nombre` `reste` `indisponibles` `interpelles` | CENTRAL ICI MISTRAL DEUX. Consommation : UN-DEUX lacrymogènes à main, peu de au lanceur. Agents blessés : aucun. Interpellés : aucun. PARLEZ. |
| `retour_base` | unite → central | unite | 1 | `lieu` | CENTRAL ICI MISTRAL DEUX. Retour à la base, secteur place de la Concorde. Embarquement terminé, effectif au complet. PARLEZ. |

### Ambiance

| Clé | De → à | Canal | Prio | Paramètres | Exemple (variante 1) |
|---|---|---|---|---|---|
| `ambiance_ras` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Rien à signaler, secteur place de la Concorde. Calme plat. PARLEZ. |
| `ambiance_rassemblement` | unite → central | unite | 0 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Le rassemblement se constitue, secteur place de la Concorde. Premiers manifestants, banderoles déployées. PARLEZ. |
| `ambiance_cortege` | unite → central | unite | 0 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Le cortège avance, secteur place de la Concorde. Volume : UN-DEUX, slogans scandés, rien d’anormal. PARLEZ. |
| `ambiance_vigilance` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Ambiance qui se tend un peu, secteur place de la Concorde. Je reste vigilant. PARLEZ. |
| `ambiance_tension` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Tension palpable, secteur place de la Concorde. Groupes déterminés devant la ligne. PARLEZ. |
| `ambiance_affrontement` | unite → central | unite | 0 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Affrontements sur le secteur place de la Concorde. Les jets continuent, la ligne tient. PARLEZ. |
| `ambiance_dispersion` | unite → central | unite | 0 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Dispersion en cours, secteur place de la Concorde. La foule s’éclaircit, départs par les rues latérales. PARLEZ. |
| `ambiance_apres` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Calme revenu, secteur place de la Concorde. Nettoyage de la chaussée en cours. PARLEZ. |
| `ambiance_logistique` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Eau distribuée aux agents, secteur place de la Concorde. La chaleur du casque se fait sentir. PARLEZ. |
| `ambiance_circulation` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Circulation dense aux abords, secteur place de la Concorde. Les déviations tiennent. PARLEZ. |
| `ambiance_slogans` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Slogans repris en chœur, secteur place de la Concorde. Banderoles lisibles, ambiance bon enfant. PARLEZ. |
| `ambiance_foyers` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Fumée noire au loin, secteur place de la Concorde. Un feu de mobilier urbain est probable. PARLEZ. |
| `ambiance_secours_veille` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Dispositif de secours en veille à proximité, secteur place de la Concorde. Ambulance prête à intervenir. PARLEZ. |
| `ambiance_presse` | unite → central | unite | 0 | `lieu` | CENTRAL ICI MISTRAL DEUX. Nombreux journalistes et téléphones levés, secteur place de la Concorde. Tout est filmé. PARLEZ. |
| `ambiance_effectif` | unite → central | unite | 0 | `lieu` `nombre` | CENTRAL ICI MISTRAL DEUX. Point d’effectif, secteur place de la Concorde : UN-DEUX agents disponibles, tout le monde est apte. PARLEZ. |
| `ambiance_heure` | central → tous | commandement | 0 | `heure` | TOUTES UNITÉS ICI CENTRAL. Il est UNE-SEPT heures ZÉRO-QUATRE. Point horaire, rien de particulier à signaler. TERMINÉ. |
| `ambiance_meteo` | unite → central | unite | 0 | `meteo` `lieu` | CENTRAL ICI MISTRAL DEUX. Conditions : stable, secteur place de la Concorde. Les agents s’adaptent. PARLEZ. |
