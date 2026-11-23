# Full unit suite on the worktree, 23 Nov 22:21–22:46 UTC: 4124 passed, 11 failed, 117 skipped


## tests/unit/bravm.ordres-joueur.test.ts — 1 red of 8
- T5 : « Interpeller » un auteur de fait constaté à 125 m — un binôme sur lui en 45 s, interpellé au bout de sa fuite
  AssertionError: interpellé: expected -1 to be greater than 0
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/bravm.ordres-joueur.test.ts:278:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/integration.journee.chef-bravm.test.ts — 1 red of 2
- il ne remonte pas : 20 s après, la BRAV-M part, sa moto et son pilote l’attendent ; monté, il la rejoint
  AssertionError: expected +0 to be 9636 // Object.is equality
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.journee.chef-bravm.test.ts:130:51
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/integration.nasse-sortie-filtree.test.ts — 2 red of 9
- graine 23, 110 manifestants
  AssertionError: expected 66 to be 67 // Object.is equality
      at scenario (/tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.nasse-sortie-filtree.test.ts:139:29)
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.nasse-sortie-filtree.test.ts:147:5
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- graine 5, 100 manifestants
  AssertionError: expected 58 to be 57 // Object.is equality
      at scenario (/tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.nasse-sortie-filtree.test.ts:139:29)
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.nasse-sortie-filtree.test.ts:147:5
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/integration.suivre.test.ts — 1 red of 5
- Centaure : jamais seul — le second Centaure et l’escorte suivent l’engin du joueur
  AssertionError: expected 85.07884248085188 to be less than 40
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.suivre.test.ts:170:16
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/law.interpelle-joueur.test.ts — 1 red of 4
- monter dans un véhicule en escortant l’interpellé : il est confié au binôme libre le plus proche
  AssertionError: un binôme l’a pris en escorte: expected false to be true // Object.is equality
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/law.interpelle-joueur.test.ts:330:52
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/playtest.bravm-passager.test.ts — 3 red of 7
- journée : commissariat du 9e arrondissement (rue Chauchat) → Place de la Bastille (graine 5)
  AssertionError: moto#7235 sur place: expected 2164.7595589359994 to be less than 250
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.bravm-passager.test.ts:110:103
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- journée : caserne de la Cité → Place de la République (graine 3)
  AssertionError: expected [ '#12510@834m' ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.bravm-passager.test.ts:119:20
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- chef de la BRAV-M, mode libre (République, graine 21) : son ordre fait partir toute la BRAV-M avec lui
  AssertionError: expected 375.73105397933136 to be less than 250
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.bravm-passager.test.ts:292:19
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/playtest.colonne-ia.test.ts — 1 red of 5
- bravm : commissariat du 9e arrondissement (rue Chauchat) → Place de la Bastille
  AssertionError: expected [ 'moto_bravm', 'moto_bravm' ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonne-ia.test.ts:170:39
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/ui-command.envoi-fiche.test.ts — 1 red of 4
- foule : « Encercler (nasse) » donne une rue à chaque unité ; la nasse ouvre ensuite sa sortie filtrée la plus large
  AssertionError: expected 0 to be greater than or equal to 1
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/ui-command.envoi-fiche.test.ts:168:39
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20