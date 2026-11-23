# Full unit suite on the worktree, 23 Nov 20:13–20:42 UTC: 4080 passed, 53 failed, 117 skipped


## tests/unit/bravm.ordres-joueur.test.ts — 1 red of 8
- T5 : « Interpeller » un auteur de fait constaté à 125 m — un binôme sur lui en 45 s, interpellé au bout de sa fuite
  AssertionError: interpellé: expected -1 to be greater than 0
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/bravm.ordres-joueur.test.ts:278:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/integration.avec-moi.test.ts — 1 red of 2
- « Avec moi » à pied (A) : une section à 700 m vient en fourgons et le suit ; l’état-major et la section proche viennent à pied
  AssertionError: expected -1 to be greater than 0
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.avec-moi.test.ts:129:17
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

## tests/unit/integration.suivre.test.ts — 2 red of 5
- commandant au volant : toute la compagnie embarque, suit en colonne, puis débarque en ligne et le suit (le canon garde son équipage)
  AssertionError: expected false to be true // Object.is equality
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.suivre.test.ts:138:124
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- Centaure : jamais seul — le second Centaure et l’escorte suivent l’engin du joueur
  AssertionError: expected 85.07884248085188 to be less than 40
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/integration.suivre.test.ts:164:16
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/playtest.apparition-roles.test.ts — 1 red of 4
- la BRAV-M de l’IA part de SON commissariat (rue Chauchat), pas de la caserne de la compagnie
  AssertionError: expected undefined to be defined
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.apparition-roles.test.ts:521:20
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

## tests/unit/playtest.colonnes-roles.test.ts — 36 red of 42
- concorde crs/bouclier driver
  AssertionError: concorde crs/bouclier au volant de fourgon_crs#30 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde crs/lanceur driver
  AssertionError: concorde crs/lanceur au volant de fourgon_crs#31 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde crs/lbd driver
  AssertionError: concorde crs/lbd au volant de fourgon_crs#38 : roulé 6 m ; 0/8 véhicules suivent (chaîne de 2) ; manquent vl_commandement#22(MISTRAL ord=embarquer idle/repos avancé 0 m) fourgon_crs#30(MISTRAL 1 ALFA ord=embarquer idle/repos avancé 0 m) fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer idle/repos avancé 0 m) fourgon_crs#52(MISTRAL 2 ALFA ord=embarquer idle/repos avancé 0 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer idle/repos avancé 0 m) fourgon_crs#68(MISTRAL 2 CHARLIE ord=embarquer idle/repos avancé 0 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/attente avancé 5 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente/vehicule avancé 29 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde crs/extincteur driver
  AssertionError: concorde crs/extincteur au volant de fourgon_crs#31 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde crs/interpellation driver
  AssertionError: concorde crs/interpellation au volant de fourgon_crs#38 : roulé 521 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde crs/conducteur driver
  AssertionError: concorde crs/conducteur au volant de fourgon_crs#30 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde chef_groupe/chef_groupe driver
  AssertionError: concorde chef_groupe/chef_groupe au volant de fourgon_crs#30 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde chef_groupe/chef_section driver
  AssertionError: concorde chef_groupe/chef_section au volant de fourgon_crs#46 : roulé 522 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde commandant driver
  AssertionError: concorde commandant au volant de vl_commandement#22 : roulé 521 m ; 7/8 véhicules suivent (chaîne de 8) ; manquent centaure#96(CENTAURE 1 ord=embarquer follow/en_route avancé 114 m) ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde commissaire driver
  AssertionError: concorde commissaire au volant de vl_commandement#22 : roulé 521 m ; 4/8 véhicules suivent (chaîne de 8) ; manquent fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 137 m) fourgon_crs#52(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 149 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/en_route avancé 148 m) centaure#96(CENTAURE 1 ord=embarquer follow/bloque/mur avancé 102 m) ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde operateur_canon_eau driver
  AssertionError: concorde operateur_canon_eau au volant de canon_eau#109 : roulé 527 m ; 8/8 véhicules suivent (chaîne de 9) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- concorde telepilote driver
  AssertionError: concorde telepilote au volant de voiture_police#108 : roulé 522 m ; 0/9 véhicules suivent (chaîne de 9) ; manquent vl_commandement#22(MISTRAL ord=embarquer follow/en_route avancé 16 m) fourgon_crs#30(MISTRAL 1 ALFA ord=embarquer follow/attente avancé 3 m) fourgon_crs#38(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer follow/en_route avancé 0 m) fourgon_crs#52(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 0 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/en_route avancé 0 m) fourgon_crs#68(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 0 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 27 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente avancé 42 m) ; à pied 13 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(12) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/bouclier driver
  AssertionError: republique crs/bouclier au volant de fourgon_crs#31 : roulé 520 m ; 2/8 véhicules suivent (chaîne de 8) ; manquent vl_commandement#23(MISTRAL ord=embarquer follow/en_route avancé 0 m) fourgon_crs#39(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#47(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#61(MISTRAL 2 BRAVO ord=embarquer follow/en_route avancé 0 m) canon_eau#93(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 6 m) centaure#97(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/lanceur driver
  AssertionError: republique crs/lanceur au volant de fourgon_crs#31 : roulé 520 m ; 2/8 véhicules suivent (chaîne de 8) ; manquent vl_commandement#23(MISTRAL ord=embarquer follow/en_route avancé 0 m) fourgon_crs#39(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#47(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#61(MISTRAL 2 BRAVO ord=embarquer follow/en_route avancé 0 m) canon_eau#93(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 6 m) centaure#97(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/lbd driver
  AssertionError: republique crs/lbd au volant de fourgon_crs#39 : roulé 516 m ; 0/8 véhicules suivent (chaîne de 8) ; manquent vl_commandement#23(MISTRAL ord=embarquer follow/en_route avancé 0 m) fourgon_crs#31(MISTRAL 1 ALFA ord=embarquer follow/en_route avancé 0 m) fourgon_crs#47(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#53(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 0 m) fourgon_crs#61(MISTRAL 2 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#69(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 35 m) canon_eau#93(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 5 m) centaure#97(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/extincteur driver
  AssertionError: republique crs/extincteur au volant de fourgon_crs#30 : roulé 517 m ; 3/8 véhicules suivent (chaîne de 3) ; manquent fourgon_crs#52(MISTRAL 2 ALFA ord=embarquer follow/en_route avancé 490 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/attente/vehicule avancé 492 m) fourgon_crs#68(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 486 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/attente avancé 48 m) centaure#96(CENTAURE 1 ord=embarquer follow/bloque/mur avancé 1 m) ; à pied 16 (MISTRAL 1 ALFA:chef_groupe,MISTRAL 1 ALFA:bouclier,MISTRAL 1 ALFA:bouclier,MISTRAL 1 ALFA:lanceur,FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto): expected [ 'MISTRAL 1 ALFA:chef_groupe', …(15) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/interpellation driver
  AssertionError: republique crs/interpellation au volant de fourgon_crs#38 : roulé 517 m ; 3/8 véhicules suivent (chaîne de 3) ; manquent fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 502 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/en_route avancé 490 m) fourgon_crs#68(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 480 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/attente avancé 182 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente/personne avancé 209 m) ; à pied 17 (MISTRAL 1 BRAVO:chef_groupe,MISTRAL 1 BRAVO:bouclier,MISTRAL 1 BRAVO:bouclier,MISTRAL 1 BRAVO:bouclier,MISTRAL 1 BRAVO:lbd,FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd): expected [ Array(17) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique crs/conducteur driver
  AssertionError: republique crs/conducteur au volant de fourgon_crs#33 : roulé 517 m ; 6/8 véhicules suivent (chaîne de 8) ; manquent canon_eau#95(NEPTUNE 1 ord=embarquer follow/attente avancé 48 m) centaure#99(CENTAURE 1 ord=embarquer follow/bloque/mur avancé 1 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique chef_groupe/chef_groupe driver
  AssertionError: republique chef_groupe/chef_groupe au volant de fourgon_crs#30 : roulé 520 m ; 2/8 véhicules suivent (chaîne de 8) ; manquent vl_commandement#22(MISTRAL ord=embarquer follow/en_route avancé 0 m) fourgon_crs#38(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/en_route avancé 0 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 6 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique chef_groupe/chef_section driver
  AssertionError: republique chef_groupe/chef_section au volant de fourgon_crs#46 : roulé 520 m ; 2/8 véhicules suivent (chaîne de 8) ; manquent vl_commandement#22(MISTRAL ord=embarquer follow/en_route avancé 0 m) fourgon_crs#30(MISTRAL 1 ALFA ord=embarquer follow/en_route avancé 0 m) fourgon_crs#38(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/attente avancé 0 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 5 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique commandant driver
  AssertionError: republique commandant au volant de vl_commandement#23 : roulé 517 m ; 0/8 véhicules suivent (chaîne de 8) ; manquent fourgon_crs#31(MISTRAL 1 ALFA ord=embarquer follow/en_route avancé 0 m) fourgon_crs#39(MISTRAL 1 BRAVO ord=embarquer follow/en_route avancé 1 m) fourgon_crs#47(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#53(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 0 m) fourgon_crs#61(MISTRAL 2 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#69(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 35 m) canon_eau#93(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 4 m) centaure#97(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique commissaire driver
  AssertionError: republique commissaire au volant de vl_commandement#22 : roulé 516 m ; 0/8 véhicules suivent (chaîne de 8) ; manquent fourgon_crs#30(MISTRAL 1 ALFA ord=embarquer follow/en_route avancé 0 m) fourgon_crs#38(MISTRAL 1 BRAVO ord=embarquer follow/en_route avancé 1 m) fourgon_crs#46(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 0 m) fourgon_crs#52(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 0 m) fourgon_crs#60(MISTRAL 2 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#68(MISTRAL 2 CHARLIE ord=embarquer follow/en_route avancé 35 m) canon_eau#92(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 4 m) centaure#96(CENTAURE 1 ord=embarquer follow/attente avancé 0 m) ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique operateur_canon_eau driver
  AssertionError: republique operateur_canon_eau au volant de canon_eau#110 : roulé 517 m ; 0/8 véhicules suivent (chaîne de 9) ; manquent vl_commandement#24(MISTRAL ord=embarquer follow/attente avancé 40 m) fourgon_crs#32(MISTRAL 1 ALFA ord=embarquer follow/attente avancé 29 m) fourgon_crs#40(MISTRAL 1 BRAVO ord=embarquer follow/attente avancé 16 m) fourgon_crs#48(MISTRAL 1 CHARLIE ord=embarquer follow/attente avancé 28 m) fourgon_crs#54(MISTRAL 2 ALFA ord=embarquer follow/attente avancé 51 m) fourgon_crs#62(MISTRAL 2 BRAVO ord=embarquer follow/bloque/mur avancé 64 m) canon_eau#94(NEPTUNE 1 ord=embarquer follow/en_route avancé 84 m) centaure#98(CENTAURE 1 ord=embarquer follow/attente avancé 47 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- republique telepilote driver
  AssertionError: republique telepilote au volant de voiture_police#111 : roulé 456 m ; 3/9 véhicules suivent (chaîne de 9) ; manquent vl_commandement#25(MISTRAL ord=embarquer follow/attente avancé 2 m) fourgon_crs#33(MISTRAL 1 ALFA ord=embarquer follow/attente avancé 1 m) fourgon_crs#55(MISTRAL 2 ALFA ord=embarquer follow/en_route avancé 0 m) fourgon_crs#63(MISTRAL 2 BRAVO ord=embarquer follow/attente avancé 0 m) fourgon_crs#71(MISTRAL 2 CHARLIE ord=embarquer follow/attente avancé 0 m) canon_eau#95(NEPTUNE 1 ord=embarquer follow/bloque/mur avancé 5 m) ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/bouclier driver
  AssertionError: bastille crs/bouclier au volant de fourgon_crs#30 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/lanceur driver
  AssertionError: bastille crs/lanceur au volant de fourgon_crs#30 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/lbd driver
  AssertionError: bastille crs/lbd au volant de fourgon_crs#40 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/extincteur driver
  AssertionError: bastille crs/extincteur au volant de fourgon_crs#30 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/interpellation driver
  AssertionError: bastille crs/interpellation au volant de fourgon_crs#38 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille crs/conducteur driver
  AssertionError: bastille crs/conducteur au volant de fourgon_crs#30 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille chef_groupe/chef_groupe driver
  AssertionError: bastille chef_groupe/chef_groupe au volant de fourgon_crs#30 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille chef_groupe/chef_section driver
  AssertionError: bastille chef_groupe/chef_section au volant de fourgon_crs#46 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille commandant driver
  AssertionError: bastille commandant au volant de vl_commandement#23 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille commissaire driver
  AssertionError: bastille commissaire au volant de vl_commandement#22 : roulé 517 m ; 8/8 véhicules suivent (chaîne de 8) ; manquent — ; à pied 6 (FAUCON 1-1:chef_groupe,FAUCON 1-2:lbd,FAUCON 1-3:passager_moto,FAUCON 1-4:passager_moto,FAUCON 1-5:passager_moto,FAUCON 1-6:passager_moto): expected [ 'FAUCON 1-1:chef_groupe', …(5) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille operateur_canon_eau driver
  AssertionError: bastille operateur_canon_eau au volant de canon_eau#108 : roulé 519 m ; 8/8 véhicules suivent (chaîne de 9) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- bastille telepilote driver
  AssertionError: bastille telepilote au volant de voiture_police#110 : roulé 517 m ; 9/9 véhicules suivent (chaîne de 9) ; manquent — ; à pied 12 (FAUCON 1-1:chef_groupe,FAUCON 1-1:pilote_moto,FAUCON 1-2:lbd,FAUCON 1-2:pilote_moto,FAUCON 1-3:passager_moto,FAUCON 1-3:pilote_moto,FAUCON 1-4:passager_moto,FAUCON 1-4:pilote_moto): expected [ 'FAUCON 1-1:chef_groupe', …(11) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.colonnes-roles.test.ts:392:30
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/playtest.commandant-accuse.test.ts — 1 red of 2
- Concorde : section (Bloquer, Tenir, Avancer), BRAV-M (Interpeller) et un refus — accusé ≤ 1 s, jamais avant l’ordre
  AssertionError: Interpeller sans fait constaté (refus) : ICI MISTRAL DEUX. REÇU, je vais constater sur place. TERMINÉ.: expected false to be true // Object.is equality
      at check (/tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.commandant-accuse.test.ts:109:71)
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.commandant-accuse.test.ts:187:5
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/playtest.commandant-compagnie-depart.test.ts — 3 red of 5
- Place de la Concorde, graine 7
  AssertionError: colonne en_place : pas arrivés: expected [ …(9) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.commandant-compagnie-depart.test.ts:117:94
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- Place de la Bastille, graine 5
  AssertionError: partis trop tard ou jamais: expected [ …(3) ] to deeply equal []
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.commandant-compagnie-depart.test.ts:115:62
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20
- Place de la République, graine 21 (journée de service)
  AssertionError: expected 'pied' to be 'vehicules' // Object.is equality
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/playtest.commandant-compagnie-depart.test.ts:85:24
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20

## tests/unit/police.interpelles-fourgon.test.ts — 1 red of 6
- République : l’unité partie à 250 m des fourgons interpelle — le fourgon vient (plus de « demande un véhicule » sans réponse)
  AssertionError: monté dans un fourgon cellulaire: expected -1 to be greater than 0
      at /tmp/claude-0/hunt/ordres-directs-impl/crs-simulation/tests/unit/police.interpelles-fourgon.test.ts:232:57
      at async file:///home/user/SafeDeal/crs-simulation/node_modules/vitest/dist/chunks/run.CjdgFZiW.js:2801:20