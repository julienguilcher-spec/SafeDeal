# Coordination étape 7 (P24 / P25) — demandes et petites modifications dans les fichiers de l'autre paquet

## P24 → P25 (04 h 45) — FAIT, petit et local : `src/ui/command/direct/runtime.ts`, `watchdog()`
- Ajout d'une garde de 8 lignes juste après le premier `return` de `watchdog()` : si l'unité du ticket tient depuis un
  AUTRE ordre du joueur (`squad.order.byPlayer`, type différent de `ticket.orderType`, `issuedAt` postérieur au ticket),
  la surveillance ne redonne plus l'ancien ordre (`finishOnFoot`). Cause relevée (cdt-05 passager, PLAYTEST_TRACE) :
  « Encercler » donne `couper_circulation` à MISTRAL 4 (ticket « route ») ; le joueur donne ensuite « Suivez-moi » à
  toute la compagnie (le ticket de la SECTION n'est pas remplacé : `replace()` ne remplace que l'unité adressée) ;
  19 s plus tard `watchdog → finishOnFoot` (runtime.ts:1166) redonnait `couper_circulation` à MISTRAL 4.
- Suggestion pour P25 (non faite, à vous de juger) : `replace(squadId)` pourrait aussi marquer « remplace » les tickets
  des unités SOUS l'unité adressée (isUnder) — sinon la ligne d'état garde le ticket périmé de la section (« MISTRAL 4 ·
  Bloquer … en route ») alors qu'elle suit le joueur.
- Rouges de MA base (04 h 17–04 h 31, avant toute modification de ma part), pour information : `playtest.ordre-direct-cdt01`
  (e) « à bord d'un fourgon cellulaire en 120 s » et `playtest.ordre-direct-cdt04` (e) « la BRAV-M revient avec lui » —
  vos chantiers en cours, je n'y touche pas.

## P25 → P24 (04 h 50) — FAIT, petit et local : `src/gameplay/session/follow.ts`, `orderOnFoot()`
- 4 lignes au début de `orderOnFoot` : la branche « la BRAV-M choisit elle-même » (`suivre` donné tout de suite, sans
  `debarquer` d'abord) vaut aussi pour la BRAV-M que le joueur commande lui-même (chef de la BRAV-M à pied, unité en
  selle) : `cmd.special(s.id)?.kind === 'bravm'`. Avant : `apartBravm` rend 0 quand le joueur est sous la BRAV-M, donc A
  donnait `debarquer` pendant 5 s, sans « REÇU » (recette chef-bravm, acceptations 6 et 9). Rien d'autre n'est touché.
- Pour information (mes fichiers, effets possibles sur vos mesures) : `arrest-service.ts` / `ops-arrest.ts` — le fourgon
  cellulaire appelé n'est plus retenu « coincé » au bout de 12 s quand il manœuvre pour sortir de sa file (45 s), l'appel
  est refusé quand l'itinéraire du fourgon n'est pas direct (rendez-vous sur une rue voisine : un autre rendez-vous sur
  le chemin du binôme est essayé) ; `bravm.ts` — une moto sans opérateur ne mène plus la colonne, une tête immobile 5 s
  sur un ordre du joueur cède la tête, accusé immédiat de « Interpeller » et de « Avec moi » pied à terre.
- Vu de mon côté à 04 h 33 : vos modifications de `sim/vehicles/autopilot-sense.ts` changent le trajet d'arrivée de
  cdt-01 (506 → 532 s) et cdt-04 (418 → 428 s) ; mes recettes `playtest.ordre-direct-cdt01/cdt04` jouent alors une autre
  partie (autre rue désignée en (a), autre auteur en (e)) : je les rejoue à la fin, sur votre état du moment.

## P25 (05 h 05) — rectificatif de ma note de 04 h 50, état final de mes fichiers
- RETIRÉ (remis comme avant) : dans `arrest-service.ts` le refus d'un rendez-vous « pas direct » et la vitesse de 4 m/s
  (ils faisaient rouler le fourgon 58 m au lieu de 278 dans `police.interpelles-fourgon` « 250 m ») ; dans `bravm.ts`
  « une moto sans opérateur ne mène pas » et « la tête immobile 5 s cède la tête » (la recette chef-bravm désignait
  ensuite un autre point pour « Envoyer près », non atteint en 60 s).
- GARDÉ : `ops-arrest.ts` / `arrest-service.ts` — un fourgon appelé garé derrière un autre véhicule a 45 s (au lieu de
  12) pour sortir de sa file tant qu'il manœuvre à moins de 30 m de sa place (`pullingOut`) ; `bravm.ts` — accusé de
  « Interpeller » quand l'approche commence, refus « groupe compact » dit tout de suite ('police:order_done'), accusé
  « pied à terre, je vous suis » ; `follow.ts orderOnFoot` (4 lignes, voir plus haut) ; `direct/runtime.ts replace()`
  remplace aussi les tickets des unités sous l'unité adressée (votre suggestion) ; `direct/natural.ts` : la distance
  de la ligne « Entrée » est celle de l'unité au point.
- Rouges vus sur l'arbre commun à 04 h 55, mes modifications d'arrestation désactivées (donc pas de mon fait) :
  `integration.nasse-sortie-filtree` graines 11, 23, 31 (11 et 43 à 04 h 45) ; `bravm.colonne-arrivee` « moto restée
  en arrière » (60 au lieu de < 60) ; ils bougent avec `sim/vehicles/autopilot-sense.ts`.

## P25 (05 h 35) — `follow.ts orderOnFoot` REMIS COMME AVANT
- Les 4 lignes ajoutées à 04 h 50 dans `orderOnFoot` (BRAV-M commandée par le joueur : `suivre` tout de suite) sont
  retirées : A du chef de la BRAV-M était vert, mais l'ordre donné deux secondes après un A était pris 3,7 s plus tard
  par la BRAV-M (recette chef-bravm « Interpeller » : accusé à 3,78 s). `follow.ts` est de nouveau tel que vous l'avez.

## P24 (06 h 20) — état final de mes fichiers (pour vos derniers passages de recette)
- `sim/vehicles/autopilot-sense.ts` + `autopilot-drive.ts` : version FINALE, étroite — plus de changement à l'approche. Seul
  cas modifié : un véhicule de police arrêté 6 s (10 s sans urgence) devant un mobilier FIXE LONG qu'il allait signaler
  comme « rue fermée » regarde sa vraie boîte (`ApSensor.boxClear`) ; s'il ne mord pas sur le couloir, il repart et la rue
  n'est pas signalée. Les versions de 04 h 33–04 h 57 (boîte à l'approche, puis après 1 s d'arrêt) sont RETIRÉES : elles
  changeaient les trajets de cdt-01/cdt-04 ; avec la version finale vos recettes cdt01/cdt04 étaient vertes chez moi
  (22 passés, 2 attendus en échec), ainsi que `integration.nasse-sortie-filtree` et `bravm.colonne-arrivee`.
- `sim/police/command/convoy.ts` : `shortPark` (arrêt court de la colonne de la compagnie du joueur à moins de 300 m du
  point quand la tête n'a plus qu'un détour ≥ 4× / +500 m, ou est arrêtée pour de bon le joueur à bord : tout le monde
  débarque là et finit à pied) ; `rejoin` (à l'embarquement, l'unité libérée par un ordre puis rappelée « avec moi »
  reprend sa place dans la colonne). `gameplay/missions/system.ts` : `tailIn` (journée « sur place » : la mission attend
  au plus 120 s que 90 % de la compagnie soit à moins de 300 m du joueur, s'il est à moins de 400 m du lieu).
  `gameplay/session/journee.ts` : texte d'arrivée « Colonne arrêtée à N mètres de … » quand elle s'arrête avant le lieu.
- Dans VOS fichiers : seulement la garde de `runtime.ts watchdog()` (04 h 45). Ma garde finale (playtest.colonnes-roles
  42/42 dans les deux modes ; lot de garde 67 fichiers, 312 passés, 10 attendus en échec, 0 rouge) a tourné à 05 h 50
  sur l'arbre commun de ce moment-là.
- `tests/unit/playtest.ordre-direct-journee.test.ts` (à moi) : l'étape « sur la route » accepte la branche « point à plus
  de 150 m de l'unité : emportée jusqu'à l'arrêt » du §2.5 (la ligne nommait MISTRAL 1 · 550 m) ; 6 passés, 6 attendus en échec.
