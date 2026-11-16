# Compte rendu — simu:droit

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module du droit écrit, branché et testé : `src/gameplay/law/` (21 fichiers, tous ≤ 543 lignes) publie `ctx.law` (LawApi complet) et quatre services étendus. 86 tests verts sur 7 fichiers (`npx vitest run tests/unit/law`), `npx tsc --noEmit` : 0 erreur dans tout le dépôt au dernier passage.

Ce qui est fait :
1. SOMMATIONS — textes de l'art. R. 211-11 au caractère près (sans ponctuation finale, comme le texte réglementaire). Progression annonce → première → dernière, puis réitération (étape 3 répétée) avant l'usage des armes. Délais de la table A.5 de la bible selon la durée de mission (15/15/10/5, 30/30/20/10, 60/60/40/20, 120/120/60/30 s), modifiables par `law.config` ou `config.extra`. Refus motivés (non habilité, hors de combat, insigne non porté, délai) avec `ctx.ui.notify` pour le joueur. Événement `law:sommation`, compte rendu radio. Mégaphone, sonorisation d'un véhicule de police ou voix nue (notée « procédure fragile ») ; fusée rouge tirée d'office si la foule est hors de portée. Annonce sur cortège calme relevée comme faute. Séquence close quand la dispersion est effective, ou reprise à l'annonce au-delà de 150 m.
   IMPORTANT : le BRIEF a changé pendant le travail (« un seul chef »). J'ai aligné le module sur le BRIEF et sur `docs/INTEGRATION-NOTES.md` : le poste `commandant_unite` est habilité, comme `commissaire`, `autorite_civile` et tout membre des forces portant `look.sash`. La bible (A.3.2) et le dossier 01 disent encore l'inverse.
2. RÈGLES D'ENGAGEMENT — recalculées à chaque pas : `underAttack` déduit des événements (agent blessé par un tiers, projectile hostile près des agents ou sur un véhicule de police, incendie, explosion, véhicule lancé sur un agent, rébellion), mémoire de 30 s ; `lawfulForce` 1 → 3 (dernière sommation + délai) → 4 (réitération + délai, ou violences) ; `authorizedForce` = min(licite, ordre).
3. reportForce — verdict motivé en français pour chaque acte : les six verdicts, avec état de la cible (entravée, à terre, maîtrisée, mains en l'air, en fuite), cibles protégées, LBD (objectif individualisé, auteur de violences à l'instant, 10–50 m, tête), désencerclement hors prise à partie, arme de service hors légitime défense, véhicule contre des personnes, tir tendu, milieu clos, autre compartiment de terrain, force poursuivie après dispersion, foule encerclée. Journal avec mention filmé, `law:force`, plainte probable, message immédiat au joueur fautif.
4. INFRACTIONS ET PREUVES — gravité par défaut, « vu » (agent valide, portée réduite la nuit et par brouillard, ligne de vue, fumée, mobilier opaque), « filmé » (journaliste ou observateur qui filme, téléphone levé, caméra-piéton proche, drone en vol, `media:shot`). Doubles déclarations fusionnées (2 s). `canArrest` = délit de gravité ≥ 2 vu ou filmé.
5. INTERPELLATION — sept gestionnaires (maitriser, menotter, palper, escorter, remettre, relacher, controler), `Person.custody`, liens heldBy/carrying, animations `restrain` / `cuffed`, événements `person:arrested` / `handed_over` / `released`. Chaque procédure est notée (fondée ou non, preuves, force employée, menottage justifié, solidité).
6. DOSSIER — `law.records` : sommations, autorisations, forces, interpellations, contrôles, plaintes, score 0..100, suite disciplinaire encourue, `summary()` en français, filtrable par agent.

Ajouts hors demande stricte : service `law.advisor` (verdict à blanc sans rien inscrire, délais restants, motif de refus) pour les IA et l'interface ; règle de l'issue libre (foule encerclée : pas de délit, force disproportionnée).

Vérification d'intégration ponctuelle, non livrée : chaîne complète rejouée avec les vrais modules `sim/people` et `sim/items` (locomotion, interactions, mégaphone, bâton) — elle passe. Avec ces modules, un agent qui tient une personne au sol se déplace très lentement.

## API publique et mode d'emploi

EXPORT : `createSystems: ModuleFactory` depuis '@/gameplay/law' → deux systèmes : « law » (order RULES = 800) et « law.custody » (order MOVEMENT − 10 = 390, écrit la commande des personnes retenues après les contrôleurs, avant la locomotion). Types à importer en `import type` depuis '@/gameplay/law/api'. `testkit.ts` ne sert qu'aux tests.

ctx.law (LawApi)
- `sommation(by)` : étape atteinte, ou étape inchangée si refus. À l'étape 3, un nouvel appel est la RÉITÉRATION : l'étape reste 3, `roe.sommationAt` change, `law:sommation` est réémis.
- Habilités : police ET (kind 'commissaire' | poste 'autorite_civile' | poste 'commandant_unite' | insigne porté). L'insigne doit être porté : `look.sash` ou `look.extras.brassard_tricolore > 0`.
- `roe.lawfulForce` : 1 par défaut ; 3 après la dernière sommation + `delayForce` ; 4 après réitération + `delayArmes` ; 4 tant que `underAttack`. Le niveau 5 n'est jamais global.
- `roe.authorizedForce` = min(licite, ordre) ; l'ordre vaut au moins 3 sous attaque. La dernière sommation vaut ordre de niveau 3, sa réitération de niveau 4 (événement `law:authorized`) ; `authorize()` peut ensuite baisser ou relever, effet immédiat.
- `authorize(level, byId)` : accepté si byId = 0 (script, salle), autorité habilitée, postes commandant_unite / chef_section / chef_groupe ou grade ≥ brigadier_chef ; plafonné à 4.
- `reportForce(by, means, target, x, z)` : (x, z) = point d'impact. Un `by` non policier n'est pas inscrit au journal : infraction à son encontre. Deux déclarations identiques rapprochées sont fusionnées (bâton 0,25 s ; grenades et LBD 0,3 s ; aérosol et canon à eau 1,5 s ; contact 2 s ; présence 30 s). 'lacrymo' est jugée « au lanceur » si l'objet en main est `lanceur_cougar` ou de catégorie 'launcher', ou si l'agent est tireur d'une tourelle 'lance_grenades'. `SquadOrder.maxForce` de l'unité de l'agent vaut autorisation. Exemptés de « non autorisé » : commissaire, autorite_civile, commandant_unite, grade ≥ capitaine.
- `recordOffense` : fusion même personne + même type en 2 s ; 24 infractions au plus par personne. `canArrest` : gravité ≥ 2 ET (witnessed || filmed).
- `forceLog` est le même tableau que `law.records.forces`.

SERVICES (ctx.service)
- 'law.records' (LawRecords) : sommations, autorisations, forces (ForceRecord = ForceReport + frame, distance, cameras, amended, auto…), interpellations, controles, plaintes, score, lastRefusal, `stats(byId?)`, `summary(byId?)`, `arrestOf(personId)`.
- 'law.advisor' (LawAdvisor) : `assess(...)` (verdict à blanc, objet réutilisé), `riposteAt(x,z)`, `authorizedFor(by)`, `sommationRefusal(by)`, `sommationWait()`, `forceWait()`, `armsWait()`, `reiterated`, `enclosed`, zone.
- 'law.config' (LawConfig) : délais, portées, durées, modifiables ; réinitialisé à chaque session.
- 'law.handover' (LawHandover `{ points: [{x, z, radius?, name?}] }`) : CONSOMMÉ. Le module en publie un vide s'il n'existe pas (vidé à chaque session) ; un module de mission y pousse ses points ou le remplace.

CONFIGURATION DE SESSION (`config.extra`) : 'law.delayScale' (nombre), 'law.delays' ({annonce, sommation, force, armes}), 'law.attroupement' (true = manifestation interdite, constat fondé d'emblée), 'law.requisition' (true = contrôles d'identité motivés).
CLÉS `look.extras` lues : `brassard_tricolore`, `camera_pieton`. Caméra-piéton supposée aux postes chef_groupe, chef_section, commandant_unite, lbd.

ÉVÉNEMENTS ÉMIS
- Contrat : law:sommation, law:offense, law:force, law:authorized, person:arrested {lawful}, person:handed_over, person:released, sfx ('menottes', 'petard'), fx ('feu_artifice' rouge). Aussi : `ctx.radio.say` (canal 'commandement'), `ctx.ui.notify`, `ctx.director.addTension` sur faute, interpellation infondée, foule encerclée.
- Libres (emitAny) : law:sommation_refused {byId, code, reason}, law:authorize_refused, law:under_attack {active, x, z}, law:force_amended {report}, law:dispersion_ended {x, z, reason}, law:enclosed {enclosed, x, z}, law:arrest_failed {id, byId, outcome 'fuite'|'rebellion'}, law:search, law:control, law:escape.
ÉVÉNEMENTS ÉCOUTÉS : person:hurt, projectile:spawned, projectile:impact, projectile:returned, explosion, fire:started, vehicle:state, vehicle:collision, shop:window, shop:looted, prop:damaged, media:shot, person:removed, session:started.

INTERACTIONS (enregistrées à init ; acteur = policier valide, à pied)
- maitriser : priorité 80 si fait établi, 12 sinon. Durée = (1,2 + 2,8 × résistance) × (1 − 0,25 par collègue), 0,8 s au moins. Chances = 0,92 − 0,75 × résistance + 0,15 par collègue à moins de 3 m (2 au plus). Échec : fuite ou rébellion, puis 2 s d'attente pour l'agent.
- menotter 85 (4 s) : consomme 1 'menottes' seulement si `ctx.actions.def('menottes')` existe ; rendue à la remise ou à la libération.
- palper 70 (3 s), escorter 60 (30 sans menottes ; rappelé sur l'escorté = « faire asseoir »), remettre 90 (3 s ; une IA peut passer l'id de l'interpellé ou du véhicule), relacher 15 (35 si infondée), controler 14 (5 s, situation calme).
- Remise : véhicule de police non volant, hors moto, avec un siège 'passenger' libre, à moins de 5 m → custody 'in_vehicle' ; ou point à moins de 6 m → 'handed_over', assis.

CONVENTIONS DE RETENUE
- 'held' : posture 'prone', lien heldBy/carrying avec l'agent, personne clouée où elle a été amenée au sol ; non menottée, elle s'échappe si l'agent s'éloigne de plus de 3,5 m pendant 2 s ou tombe.
- 'cuffed' : upper 'cuffed', lien défait, reste sur place.
- 'escorted' : lien heldBy/carrying ; `sim/people` la fait marcher devant l'agent. Sans module de locomotion, le droit la ramène à 1 m dès qu'elle s'écarte de plus de 1,5 m. Non menottée : risque d'évasion chaque seconde.
- Les IA de foule ne doivent pas piloter une personne dont custody ≠ 'free'.

## Mesures

Scène de mesure : 1 521 personnes (1 200 manifestants, 250 CRS, 50 tiers, 20 interpellés escortés), pas de 1/30 s, systèmes « law » + « law.custody » cumulés (tests/unit/law.perf.test.ts).
- Au repos (cortège) : 1,5 à 2 µs par pas sur machine calme (jusqu'à 6 µs sous charge).
- Pic : 1 161 délits d'attroupement constatés en 20 s (recherche de témoins et de caméras pour chacun), 20 escortes, riposte ouverte : 130 µs par pas sur machine calme, 210 à 275 µs sous charge ; dont « law.custody » ≈ 1 µs.
- Régime établi ensuite : 11 à 17 µs par pas.
- recordOffense : ≈ 40 µs par appel (50 à 95 µs sous charge). reportForce : ≈ 55 µs par appel (jusqu'à 85 µs sous charge). Les 7 gestionnaires d'interaction pour un agent : 7 à 18 µs.
- Vérification de l'issue : toutes les 2 s au plus, pendant la dispersion seulement.
- Allocations : aucune dans les boucles par pas (tableaux, filtres et objets de travail réutilisés, curseur tournant sur la foule). Un objet par infraction nouvelle et par emploi de la force inscrit (données du journal). Non mesuré au profileur mémoire : affirmation fondée sur la lecture du code.

## Non fait / fragile

- Suite complète `npx vitest run` non menée à terme : interrompue après 10 min sur une machine très chargée. Sur core + law (21 fichiers), 327 tests verts et 1 échec hors de mon périmètre : seuil de temps de tests/unit/core.adverse.test.ts (31 ms pour 25 ms attendus). Un test du droit, cassé entre-temps par un changement du cœur (écharpe par défaut), a été corrigé.
- Aucun essai en navigateur ni e2e. Non testé avec les modules de foule, d'IA policière, de rôles, d'interface ni de carrière.
- RoeState reste global : une seule séquence de sommations à la fois. La localité (riposte à 60 m des violences, compartiment de 150 m) n'est appliquée que dans reportForce et law.advisor, pas par unité.
- Tir de LBD au-dessus des épaules : constaté seulement après l'impact (zone de person:hurt ou hauteur de projectile:impact). Si le module des objets ne fournit ni l'un ni l'autre, rien n'est relevé.
- Non modélisés : jet droit du canon à eau à moins de 15 m ou à la tête, binôme superviseur + tireur, tir vers un conducteur, avertissement à la foule avant riposte, durée maximale et annonces d'un encerclement, RIO masqué ou cagoule, refus d'un ordre illégal.
- Issue libre : approximation (32 rayons de 30 m depuis le centre de la foule ; bâti, mobilier, cordon de 3 agents). Dans une rue étroite elle peut conclure à tort à l'encerclement ; le seul effet est de suspendre les délits et de juger la force disproportionnée pendant ce temps.
- Fiche d'interpellation non jouable : le motif est choisi automatiquement (infraction établie la plus grave). Garde à vue et suites judiciaires non simulées ; l'interpellé remis reste assis dans le véhicule ou au point.
- Enfant reconnu par la taille (< 1,50 m) et caméra-piéton déduite du poste, faute de champs au contrat.
- Les infractions déduites des événements peuvent doubler celles d'un autre module s'il déclare le même geste sous un autre type.
- « Reste sciemment » dépend de Person.vx/vz : sans locomotion qui les renseigne, toute personne dans la zone est réputée rester.
- Les sanctions du dossier sont les sanctions encourues (indicatives) ; la décision revient au module de carrière.
- Mesures de performance prises sur machine chargée (charge 13 pour 4 cœurs) : valeurs bruitées, bornes du test volontairement larges.

## Demandes d'évolution du contrat

- Docs : la bible (A.3.2 « le commandant de CRS n'est jamais habilité ») et le dossier 01 contredisent le BRIEF « un seul chef ». J'ai suivi le BRIEF et INTEGRATION-NOTES ; à corriger dans les dossiers.
- LawApi.reportForce : ajouter un paramètre facultatif (zone d'impact 0..1, tir au lanceur ou à la main, mode du jet). Aujourd'hui ces éléments sont déduits des événements et de l'objet en main.
- LawApi : intégrer au contrat une évaluation à blanc (`assess`) et les délais restants, aujourd'hui dans le service 'law.advisor'.
- GameEvents : déclarer law:force_amended, law:under_attack, law:dispersion_ended, law:enclosed, law:arrest_failed, law:sommation_refused, law:search, law:control, law:escape (émis par emitAny).
- ForceReport : ajouter `frame` (cadre juridique retenu) et `cameras` (sources d'images), présents dans ForceRecord.
- PersonLook : champ pour le brassard tricolore (aujourd'hui `look.extras.brassard_tricolore`), pour la caméra-piéton (`look.extras.camera_pieton`) et marqueur d'âge (enfant).
- RoeState : prévoir un état par unité ou par compartiment de terrain (bible A.2).
- FORCE_LEVEL_OF : 'lacrymo' ne distingue pas main et lanceur alors que le cadre légal diffère ; un moyen 'lacrymo_lanceur' lèverait l'ambiguïté.
- core/null-law.isAuthority n'exige pas l'insigne porté pour commandant_unite / autorite_civile ; le module du droit, lui, refuse avec le motif « insigne ». À harmoniser si l'écharpe devient amovible.

## Vérifications exécutées

- npx vitest run tests/unit/law : 7 fichiers, 86 tests verts (dernier passage après le dernier découpage de fichiers)
- npx tsc --noEmit : 0 erreur dans tout le dépôt au dernier passage ; aucun symbole inutilisé dans mes fichiers (--noUnusedLocals --noUnusedParameters)
- Textes des trois sommations comparés caractère par caractère à l'art. R. 211-11 ; anciennes formules absentes
- Refus de sommation : gardien, chef de groupe, manifestant, insigne non porté, autorité hors de combat, délai non écoulé (motif et secondes restantes) ; commandant unique et commissaire acceptés
- Lacrymogène avant toute sommation sur foule calme → sans_sommation gravité 4 ; même tir après un agent blessé → licite (riposte) ; riposte refusée à 600 m des violences et après 30 s
- Lacrymogène à main après la dernière sommation + délai → licite ; trop tôt, après la seule annonce ou hors compartiment → sans_sommation ; au lanceur et GM2L → réitération exigée
- LBD : pacifique → interdit gravité 5 ; à terre, menotté, mains en l'air, en fuite → disproportionné ; auteur de violences à 25 m → licite ; à 6 m, sans cible ou après sommations seules → interdit ; impact à la tête (zone de person:hurt ou hauteur de projectile:impact) → verdict révisé en interdit
- Bâton sur journaliste identifié → cible_illegitime gravité 4 avec alerte au joueur et plainte ; secouriste, observateur, passant, enfant protégés ; faux journaliste violent non protégé
- Désencerclement, arme de service, véhicule contre piéton (rapport automatique sur vehicle:collision), tir tendu (vitesse du projectile, dans les deux ordres d'arrivée), force poursuivie après dispersion, non_autorise et ordre d'unité
- Infraction vue ou non selon un mur (monde factice), la distance, l'agent à terre ou gazé, la fumée, la nuit ; filmée par journaliste, téléphone, drone en vol, caméra-piéton, media:shot
- Chaîne complète maîtriser → menotter → palper → escorter → remettre (fourgon, puis point de regroupement), avec événements, radio et dossier ; interpellation d'un innocent notée infondée, plainte, score, relâche
- Résistance : 40 tentatives sur radicaux en colère (fuites et rébellions), rébellion constatée et agent blessé, évasion du non-menotté laissé seul, escorte mise hors de combat, menottes de dotation consommées puis rendues
- Foule encerclée par un cordon fermé : aucun délit, force disproportionnée ; après ouverture d'une issue de 14 m les délits reprennent
- Dossier : score, sanction, résumé en français relu à l'écran, filtre par agent, remise à zéro complète entre deux sessions
- Déterminisme : même graine → empreinte identique (journal, infractions, issues, radio, résumé) ; autre graine → issues d'interpellation différentes ; ctx.rng non consommé
- Intégration réelle avec sim/people et sim/items (essai jetable, supprimé) : chaîne complète avec vraie locomotion et vraies interactions, mégaphone réel → 3 sommations, bâton réel → un seul rapport

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/gameplay/law/index.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/api.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/config.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/texts.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/kernel.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/perception.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/attack.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/sommations.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/attroupement.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/exits.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/offenses.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/force.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/events.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/subdue.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/custody.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/custody-step.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/handover.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/controls.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/interactions.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/records.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/law/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.sommations.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.force.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.offenses.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.arrest.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.records.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.determinism.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/law.perf.test.ts
