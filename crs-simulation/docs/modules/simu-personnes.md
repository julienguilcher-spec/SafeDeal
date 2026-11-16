# Compte rendu — simu:personnes

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module « personnes » écrit et testé dans src/sim/people/ : 4 systèmes (contrôleur du joueur, locomotion + endurance, interactions, santé et états), exportés par createSystems. 99 tests dans 7 fichiers tests/unit/people.*.test.ts, tous verts ; aucune erreur tsc dans mes fichiers. Coût mesuré : 1,3 à 1,5 ms par pas pour 1 500 personnes en marche (objectif < 3 ms).

Ce qui fonctionne :
- **Locomotion** : accélération et freinage bornés, rotation bornée, allures modulées (endurance, blessures, gaz, étourdissement, charge, accroupi, sol mouillé, densité de foule, portage, menottes), collisions enchaînées world → props → vehicles avec glissement, séparation entre personnes pondérée par la résistance (bouclier levé ×3, unité en ligne ×2), personnes à terre enjambées, saut et enjambement d'un obstacle ≤ 1,15 m, personnes portées / traînées / escortées, occupants recalés sur leur siège, fréquence réduite au-delà de 55 m et 110 m du joueur.
- **Endurance** : sprint ≈ 25 s sans charge, ≈ 15 s avec ≈ 20 kg, récupération 8 points/s à l'arrêt et 4 en marchant, essoufflement jusqu'à 35 %.
- **Santé** : zones et protections, bouclier (± 70°, bas / parade haute / accroupi), recul, étourdissement, seuils de blessure, mise à terre minutée ou durable, aggravation sans soins, heal, décès seulement pour causes graves et en violence « réaliste », gaz, feu, eau, peur et colère.
- **Interactions** : registre, options triées, actions à durée interrompues si l'on bouge, est déplacé, frappé ou étourdi ; verbes porter, trainer, deposer, pousser.
- **Joueur** : possess, caméras, regard, déplacement relatif à la caméra, objets (charge du lancer en 0,9 s, usage continu, setAlt), invite et touche Interagir, visée, masque (8 s) et visière, conduite, tourelle, engin télépiloté, neutralisation sous écran modal.

Écarts par rapport à la demande :
- La foule dense n'est pas strictement sans chevauchement : 2,2 à 2,4 cm au pire en régime établi, 8 cm transitoire quand 500 sprinteurs percutent un mur.
- Deux cortèges denses face à face se bloquent (pas de formation de files) ; le contournement n'opère qu'à faible densité.
- La suite complète « npx vitest run » n'a pas été obtenue : je l'ai interrompue après plus de 5 minutes sans résultat. Seul le préfixe tests/unit/people a tourné (14 fichiers, 131 tests verts, ceux de people-render compris).
- Rien n'a été essayé avec les vrais modules monde, objets, dangers, véhicules et droit : uniquement les services neutres et mes doublures.

## API publique et mode d'emploi

**Export** : `createSystems: ModuleFactory` depuis `@/sim/people`, plus les types et clés de service de `api.ts` (à importer en `import type`).

**Systèmes**
- `people.player` (CONTROL 200) — remplace `ctx.player`
- `people.locomotion` (MOVEMENT 400) — appelle `ctx.people.rebuildIndex()` en fin de pas
- `people.interactions` (ACTIONS 500) — remplace `ctx.interactions`
- `people.health` (STATUS 700) — remplace `ctx.health`

**Services étendus (ctx.provide)**
- `'player.control'` : `{ remoteVehicleId, setRemoteVehicle(id), maskProgress, fovScale, crouching, turretIndex }`
- `'people.locomotion'` : `{ isWinded(p), isAirborne(p), loadOf(p), densityAt(p), pressureOf(p), speedLimit(p, gait) }`
- `'people.health'` : `{ rinseEyes(p, byId), extinguish(p, byId), stabilise(p, byId), knockDown(p, seconds, sourceId), psychDecay }`
- `'people.gear'` : `{ hasMask(p), hasVisor(p), setGasMask(p, on), setVisor(p, down) }` — immédiat, pour les IA
- `'people.interactions'` : `{ optionsFor(actor, targetId, out), progress(actor), activeCount }`

**Événements du contrat émis**
- `person:hurt`, `person:down`, `person:recovered`, `person:treated`
- `fire:started` et `fire:out` avec `targetKind: 'person'`
- `player:possessed`, `player:camera`, `vehicle:siren`
- `sfx` : `impact_bouclier`, `cri`, `toux` ; `fx` : `impact`, `feu`, `sang` (ce dernier en violence « réaliste » seulement)

**Événements libres émis (emitAny)**
- `people:blocked {id, info}` — coup entièrement arrêté par un bouclier ; aucun `person:hurt` n'est alors émis
- `people:died {id, sourceId, kind}`
- `people:carried {byId, targetId, mode}`, `people:dropped`, `people:pushed {byId, targetId, fell}`
- `people:winded {id}`
- `interaction:started | completed | cancelled {actorId, verb, targetId}`
- `player:use_failed {reason}`, `player:remote {vehicleId}`

**Événement écouté** : `fire:out` avec `targetKind: 'person'` éteint la personne visée.

**Ce que les autres modules doivent savoir**
- **Commande** : la locomotion consomme `person.cmd` et remet `cmd.jump` à false. Assis, à genoux ou à plat ventre, on se relève dès que `cmd.move` est non nul (0,6 s ou 1,1 s).
- **Joueur** : il écrit `cmd` à chaque pas ; les IA doivent ignorer une personne dont `isPlayer` est vrai. Sa visée est instantanée, celle des IA bornée à 8 rad/s.
- **Charge** : la vitesse est déjà réduite par le poids (protections + `ctx.actions.def(id).weight`). Les archétypes doivent laisser `speedWalk/Run/Sprint` aux valeurs d'une personne non chargée, sinon double pénalité.
- **Gaz** : `person.gas` est l'exposition effective, protection déjà déduite.
- **Peur et colère** : la santé gère aussi leur retour au calme (demi-vies 45 s, 25 s radical, 90 s famille ; colère 180 s). Mettre `psychDecay = false` si le module foule s'en charge.
- **Portage** : porter pose `holder.upper = 'carry_person'`, traîner pose `'drag'` (conventions du rendu). Un lien `carrying`/`heldBy` posé par un autre module est traité en escorte (la personne marche 0,55 m devant son gardien), ou en remorque si elle est à terre.
- **setDown(p, true)** sur une personne valide : chute de 2,5 à 5,5 s, puis relevé automatique seulement si `custody === 'free'` et `heldBy === 0`. Sans effet à bord d'un véhicule.
- **upperT** : je ne l'avance que pour les gestes que je pose (`pickup`, `carry_person`, `drag`, `push`, `cover_face`).
- **Tourelle** : `turretYaw` s'ajoute au cap du véhicule (positif = vers la gauche), `turretPitch` positif = vers le haut. La n-ième place de tireur sert la n-ième tourelle.
- **Engin volant télépiloté** : `throttle` = avancer, `strafe` = droite, `lift` = touches saut / accroupi, `steer` aligne l'engin sur `camYaw`.
- **Molette** : comptée une seule fois même si elle est aussi affectée à `item_next` / `item_prev`.
- **pousser** : sans cible désignée, ne propose que des personnes d'un autre camp, face à l'acteur. Un policier déclare `law.reportForce(…, 'contact', …)` ; repousser un policier enregistre `violence_agent` (gravité 2).
- **Priorités des options** : deposer 95, porter 70 (50 accroupi), trainer 60, pousser 15.

**Réglages** : tout est dans `tuning.ts`. Les plus utiles : `ACCEL_GROUND` 4,2 et `DECEL_GROUND` 7,5 m/s² ; `CARRY_SPEED` 1,2 et `DRAG_SPEED` 0,6 m/s ; `SHIELD_RUN_MAX` 3,2 m/s ; `LOD_MID` 55 m et `LOD_FAR` 110 m ; `STAMINA_SPRINT_DRAIN` 4/s ; `KNOCKDOWN_DAMAGE` 24 ; `BLEED_SERIOUS` 0,05 et `BLEED_CRITICAL` 0,15 point/s ; `GAS_RISE` 0,33/s ; `CHARGE_TIME` 0,9 s ; `MASK_DON_TIME` 8 s ; `VAULT_MAX_HEIGHT` 1,15 m.

**Doublures de test** dans `src/sim/people/testkit.ts`, réutilisables : `createWallWorld`, `ScriptedInput` + `createScriptedInputSystem`, `createFakeHazards`, `createFakeActions`.

## Mesures

Mesures vitest sous Node 22, machine à 4 cœurs partagée avec d'autres tâches. Monde neutre : world.resolveCircle et heightAt du vrai monde ne sont pas comptés.

| Scénario (1 500 personnes) | Coût par pas |
|---|---|
| En marche, cortège dense, sans joueur (tout à pleine fréquence) | 1,32 ms, dont locomotion 1,25 ms |
| En marche, joueur au milieu | 1,51 ms, dont locomotion 1,38 ms |
| Dispersées sur 300 m, joueur à un bout (fréquence réduite active) | 0,37 ms |

- Meilleure de 12 séries de 30 pas ; selon la charge de la machine, les relevés ont varié de 1,2 à 2,0 ms. Objectif : < 3 ms.
- Santé ≈ 0,05 ms, joueur ≈ 0,04 ms, interactions < 0,01 ms par pas.
- Ramasse-miettes : 11 collectes mineures en 900 pas (30 s simulées) ; 19 avant le passage des flottants par champs.

| Foule de 500 dans une rue de 12 m | Pire chevauchement |
|---|---|
| Marche contre un mur | 2,3 cm |
| Sprint contre un mur | 8,0 cm transitoire, 2,4 cm final |
| Deux cortèges face à face | 2,3 cm |
| Empilement au même point, après 12 s | distance minimale 0,54 m |

## Non fait / fragile

- Suite complète « npx vitest run » : résultat non obtenu (interrompue après plus de 5 minutes sans sortie)
- Aucun essai avec les vrais modules world/query, items, hazards, props, vehicles, law, crowd : seulement services neutres et doublures
- Le coût mesuré n'inclut pas world.resolveCircle ni heightAt du vrai monde (jusqu'à 3 appels de collision par personne en mouvement et par pas)
- Chevauchements résiduels en foule très dense : 2,2 à 2,4 cm en régime établi, 8 cm transitoires au sprint contre un mur
- Deux cortèges denses face à face se bloquent : pas de formation de files, c'est à l'IA de foule d'éviter
- Les blessures par compression de foule ne sont pas modélisées : la pression n'agit que sur la peur et sur pressureOf()
- Pas zéro allocation au sens strict : 11 collectes mineures en 900 pas à 1 500 personnes, dues aux flottants emballés par V8 aux appels de services
- Loin du joueur, une personne prolonge son mouvement sans collision pendant 1 à 3 pas ; elle peut entrer de quelques dizaines de cm dans un obstacle avant d'en être ressortie
- Enjambement d'un muret du monde (RayHit.kind 'barrier') : codé, non testé ; seul l'enjambement de mobilier l'est
- Non testés : surfaces pavés / parc / gravier (le monde neutre renvoie toujours 'plaza'), malaise asthmatique au gaz, effet de la pression sur la peur, extinction par la pluie, portage d'un objet du décor
- Les effets d'écran (voile de gaz, douleur) ne sont pas demandés : la simulation ne connaît pas le rendu ; person.gas, stun, wet et 'player.control'.fovScale sont à lire par la caméra
- Le délai de 8 s du masque ne vaut que pour le joueur ; 'people.gear'.setGasMask est immédiat pour les IA
- Zoom rudimentaire (zoom_in / zoom_out, 1 à 2,5 à pied, jusqu'à 10 en drone, tourelle ou viseur)
- Le rendu multiplie encore person.gas par (1 − 0,9·gasProtection) : sous protection partielle (foulard), l'animation de toux se déclenche plus tard que le ralentissement
- L'assertion de performance (meilleure de 12 séries < 3 ms) peut échouer sur une machine très chargée : j'ai observé jusqu'à 2,0 ms sous charge
- Probabilités de décès, seuils de mise à terre, forces de poussée et durées à terre sont des choix de conception, sans source documentaire
- Si la molette est réaffectée à autre chose que le changement d'objet, elle changera quand même d'objet

## Demandes d'évolution du contrat

- Person.upperT : préciser qui le fait avancer (le module qui pose `upper` ?). Je ne l'avance que pour mes propres gestes.
- Person.gas : préciser s'il s'agit de l'exposition effective (mon choix) ou brute. Le rendu applique encore (1 − 0,9·gasProtection).
- Vehicle.turretYaw / turretPitch : fixer le sens. J'écris : yaw ajouté au cap du véhicule, positif = vers la gauche ; pitch positif = vers le haut.
- HealthApi : ajouter knockDown(p, seconds, sourceId), stabilise, rinseEyes, extinguish (aujourd'hui dans le service 'people.health').
- GameEvents : ajouter 'person:died' {id, sourceId, kind} et 'person:blocked' {id, info} (aujourd'hui en événements libres 'people:died' et 'people:blocked').
- InteractionApi.options : paramètre optionnel targetId pour cibler ce que vise le joueur (aujourd'hui 'people.interactions'.optionsFor).
- PlayerState : ajouter fovScale et maskProgress, voire remoteVehicleId (aujourd'hui dans 'player.control').
- HazardApi.douse n'informe pas les personnes : convenir que l'auteur de l'extinction appelle health.hurt(kind 'water'), émet 'fire:out' avec targetKind 'person', ou appelle 'people.health'.extinguish.
- ActionApi.select(p, -1) : écrire au contrat que -1 range l'objet (mains nues). Le portage et le contrôleur du joueur s'en servent.
- ArchetypeApi : préciser que speedWalk/Run/Sprint sont les vitesses d'une personne non chargée, la locomotion appliquant déjà le poids de l'équipement.

## Vérifications exécutées

- npx vitest run tests/unit/people : 14 fichiers, 131 tests verts (mes 7 fichiers people.*.test.ts = 99 tests, plus ceux de people-render)
- npx tsc --noEmit : aucune erreur dans src/sim/people ni dans tests/unit/people.*.test.ts (4 erreurs ailleurs, dans src/ui et tests/unit/core.adverse-stores.test.ts)
- Vitesses et accélérations : plafonds marche / course / sprint, 0,6 à 1,1 m/s après 0,2 s, arrêt depuis le sprint en moins de 0,9 s sur 1,2 à 3 m, rotation bornée, marche arrière ×0,6, accroupi ×0,55, commande NaN sans effet
- Collisions : mur du monde factice (arrêt, glissement en biais, angle d'impasse), mobilier (kiosque), véhicule
- Saut et enjambement : barrière Vauban franchie, barrière de chantier non, réception encombrée refusée, refus accroupi ou menotté
- Foule de 500 personnes dans une rue de 12 m, en marche contre un mur : pire chevauchement 2,3 cm, aucune paire au-delà de 3 cm, vitesse jamais supérieure à 1,4 m/s
- Même foule au sprint : pire chevauchement transitoire 8,0 cm, final 2,4 cm
- 500 personnes empilées au même point : déplacement par pas borné à 3,5 m/s, vitesses nulles, distance minimale 0,54 m après 12 s
- Croisement de deux personnes face à face, contournement d'une personne immobile, bouclier levé et unité en ligne qui résistent davantage, personne à terre enjambée
- Endurance : sprint 22 à 29 s sans charge et 12 à 18,5 s avec ≈ 19 kg, récupération selon l'allure, essoufflement, effets du masque, du gaz et des blessures
- Bouclier : pavé bloqué de face (son impact_bouclier, aucun person:hurt), non bloqué de dos, à 80°, bouclier baissé ; tête et jambes selon la posture ; bâton à 10 %
- Protections par zone (valeurs exactes), étourdissement, recul, seuils de blessure, mise à terre puis relevé, état critique durable, aggravation à 0,05 et 0,15 point/s, heal et stabilise
- Décès : jamais en « sobre » ; en « réaliste » par balle (probabilité 0,6), jamais par pavé ni LBD ; blessé par balle non soigné qui meurt ; sang demandé seulement en « réaliste »
- Gaz avec dangers factices : montée en ≈ 3 s, toux, vitesse ×0,6, demi-vie 20 s, masque, foulard, exposition de plus de 40 s, rinçage
- Feu : embrasement, dégâts, fire:started et fire:out, extinction par le temps, l'eau, un jet ou un tiers, tenue ignifugée, mortel seulement en « réaliste » ; la pluie mouille puis on sèche
- Interactions : tri, action immédiate, progression, startVerb ciblé, six causes d'annulation, cible disparue, exception d'un gestionnaire isolée
- Porter (2,5 s puis 1,2 m/s), traîner (0,6 m/s à 0,95 m), déposer, porteur mis à terre, blessé soigné qui se relève une fois déposé
- Pousser : recul, délai, reportForce 'contact' pour un policier, violence_agent pour qui pousse un policier, bouclier qui encaisse
- Joueur avec InputState scripté : « face au sud, regarder à droite fait tourner vers l'ouest », déplacement relatif à la caméra, allures clavier / manette / tactile, accroupi, saut
- Joueur, objets : touches 1 à 9, molette, charge de lancer (0,5 après 0,45 s, plafond 1, minimum 0,2, annulation au clic secondaire), usage continu de la gazeuse, setAlt
- Joueur, suite : invite et touche Interagir (lancer, annuler), visée (tolérance, mur, point au sol), masque en 8 s interrompu par un coup, visière
- Véhicule : conduite (accélérateur, frein, marche arrière, gâchettes, frein à main, klaxon), sirène, gyrophares, phares, tourelle à vitesse bornée et cadence de tir, drone télépiloté
- Écran modal et controlEnabled faux, remise à zéro entre deux sessions
- Escorte d'une personne menottée (y compris contre un mur) et occupant de véhicule qui suit son siège
- Contrôle manuel avec le vrai module src/input (service input.script) : regard, déplacement, saut, molette, touches d'objets conformes ; test provisoire supprimé ensuite

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/sim/people/index.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/api.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/tuning.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/shared.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/locomotion.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/loco-speed.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/loco-held.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/loco-jump.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/cellmarks.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/health.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/health-status.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/health-util.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/gear.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/interactions.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/handlers.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/player.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/player-items.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/player-aim.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/player-gear.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/player-vehicle.ts
- /home/user/SafeDeal/crs-simulation/src/sim/people/testkit.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.locomotion.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.crowd.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.stamina.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.health.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.status.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.interactions.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/people.player.test.ts
