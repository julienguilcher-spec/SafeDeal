# Compte rendu — audio:synthèse

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le moteur sonore est écrit, branché et vérifié : src/audio exporte createSystems() → un AudioSystem (ordre SystemOrder.AUDIO) qui publie ctx.audio, 'audio.engine' et 'audio.debug'. Les 48 SoundId du contrat ont chacun une recette de synthèse WebAudio (plus 15 sons supplémentaires : pas par surface, sirène de gendarmerie et « hurleur », collision, embrasement, batterie de cortège, tonnerre, habillages radio/mégaphone, acouphène) ; aucune recette n'utilise de fichier, tout vise un BaseAudioContext quelconque (AudioContext, OfflineAudioContext, faux contexte de test). Sirènes deux-tons aux valeurs du dossier de recherche (435 Hz + 580 police / 488 pompiers lent / 651 SAMU / 732 gendarmerie), mesurées à ±2 Hz dans le rendu ; en cours de route j'ai trouvé et corrigé un vrai défaut (le carré d'un OscillatorNode plafonne à ±0,85 : les notes tombaient à 571/447 Hz). Mixage : bus maître/effets/voix/ambiance pilotés par ctx.settings, compresseur-limiteur suivi d'un écrêteur doux (ajouté après qu'une salve de 29 détonations a mesuré une crête de 1,08 avec le compresseur seul ; 0,92 désormais), spatialisation économique (atténuation, panoramique selon camYaw, passe-bas avec la distance et quand lineOfSight est faux, retard de propagation, Doppler), réserve de 32 voix à priorités avec boucles « virtuelles » qui reprennent seules. Contexte créé au premier geste, suspendu quand la page est masquée, monde muet hors phase « playing ». Ambiance vivante : relevé de la foule 4 fois/s (queryRadius, colère, peur, phase, tension) → murmure, slogans scandés dont le rythme suit les syllabes du texte (événement crowd:chant ou spontanés), huées, sifflets, panique, batterie, toux dans le gaz ; ville selon l'heure, pluie, vent, tonnerre. Câblage de tous les événements demandés, plus sirènes/klaxons/moteurs/canon à eau/feux/sifflement des grenades suivis automatiquement d'après l'état du monde ; pas du joueur et des 8 personnes proches selon surfaceAt et la vitesse. Voix : file d'attente SpeechSynthesis (voix fr-FR, 6 timbres), habillage radio et mégaphone, rien n'est dit sans voix française (une voix de mégaphone indistincte suivant la prosodie la remplace pour les sommations). Limite principale : personne n'a ÉCOUTÉ ces sons — la vérification est faite par mesures et spectrogrammes regardés un par un, pas à l'oreille ; et la synthèse vocale réelle n'a pas pu être entendue (Chromium headless n'a aucune voix française), seule sa logique est testée avec un faux speechSynthesis.

## API publique et mode d'emploi

BRANCHER LE MODULE (racine de composition, la ligne est déjà prévue en commentaire dans src/main.ts) :
  import { createSystems as audio } from '@/audio';   // puis l'ajouter à la liste des modules
Un seul système, id 'audio', order SystemOrder.AUDIO. Il n'importe que src/core/contracts.ts. En headless il publie ses services mais reste inerte (play() retourne 0).

SERVICES FOURNIS
- ctx.audio (AudioApi du contrat) : play(id, {x,y,z,volume,pitch,loop}) → poignée (0 = non joué : inaudible, réserve pleine, contexte pas encore déverrouillé pour un son ponctuel) ; stop(handle, fondu) ; speak(text, {voice, radio, volume, x, z}) ; setListener(x,y,z,yaw). Spatialisé seulement si x ET z sont fournis. Une boucle (loop:true) demandée avant le premier geste ou hors de portée reste « virtuelle » et démarre seule ensuite. Un son non entretenu demandé en boucle est relancé en rythme.
- ctx.service<EngineSoundService>('audio.engine') (type dans src/audio/api.ts, à importer en `import type`) : create(vehicleId) → { setRpm(rpm), setLoad(0..1), setPosition(x,y,z), dispose() }. setRpm accepte des tr/min réels OU une valeur normalisée ≤ 1,5 (0 = ralenti, 1 = régime maxi). Timbre choisi d'après Vehicle.kind (essence, diesel, poids lourd, moto, scooter, drone, hélicoptère). IMPORTANT : sans appel à create(), le module sonorise déjà tout seul les 5 véhicules les plus proches dont engineOn est vrai (+ celui du joueur) d'après Vehicle.rpm (ou la vitesse si rpm vaut 0) et cmd.throttle ; create() remplace cette sonorisation automatique pour le véhicule concerné, sans doublon.
- ctx.service<AudioDebug>('audio.debug') : stats() (état du contexte, voix réelles/virtuelles, sons joués/écartés), voices(), crowdMix(), unlock(), analyser(), speech().
- speak() accepte hors contrat { megaphone?: boolean, priority?: 0|1|2, y?: number } (SpeakExtra).

ÉVÉNEMENTS ÉCOUTÉS (src/audio/wiring.ts)
'sfx' (lecture directe) ; 'radio:message' (bip, souffle, voix, bip de fin ; voix = msg.voice sinon dérivée de msg.from ; priorité 2 passe devant) ; 'law:sommation' (mégaphone spatialisé en x,z) ; 'explosion' (vehicule→explosion_vehicule, gm2l→detonation, desencerclement, mortier→mortier_explosion, molotov, grenades lacrymogènes→grenade_pop, inconnu→petard ou detonation selon le rayon ; acouphène si à moins de 12 m) ; 'projectile:impact' (selon kind et hitKind ; impact_bouclier si la personne touchée a alt=true et un 'bouclier' en main) ; 'shop:window' (broken/cracked→verre, tagged→spray) ; 'shop:shutter' ; 'prop:damaged' ; 'barricade:built' ; 'fire:started' / 'fire:out' (boucle « feu » par foyer) ; 'vehicle:siren', 'vehicle:collision', 'vehicle:removed', 'vehicle:turret_fired' (canon_eau tenu 0,7 s après le dernier événement ; lance_grenades→lanceur_tir), 'vehicle:state' (burning→feu) ; 'person:hurt' (toux pour le gaz, cri sinon ; limité à 1 réaction/personne/1,2 s et 6/s) ; 'crowd:chant' (slogan scandé sur le texte fourni) ; 'session:paused', 'session:ended', 'session:started', 'settings:changed'.
LU DIRECTEMENT DANS L'ÉTAT, sans événement : Vehicle.siren (relu 2×/s : 1 → deux-tons du service selon kind/faction, 2 → « hurleur »), Vehicle.cmd.horn (klaxon tenu), Projectile.emitting (sifflement du gaz, 6 plus proches), Person.gas (toux), Person.stun du joueur et cameraMode 'vehicle_int'/'turret' (étouffement du monde), ctx.env (ville selon l'heure, pluie, vent, orage→tonnerre), ctx.director + ctx.people.queryRadius (foule), ctx.world.surfaceAt (pas), ctx.world.lineOfSight (occlusion), ctx.view.camX/Y/Z + ctx.player.state.camYaw (auditeur).

ANTI-DOUBLONS : deux demandes du même son au même endroit (< 3 m) à moins de 60 ms sont fusionnées — un module peut donc émettre l'événement de jeu ET le 'sfx' correspondant sans être entendu deux fois ; les boucles attachées (sirène, feu, canon à eau, gaz, klaxon) ne démarrent pas si une boucle du même son tourne déjà au même endroit ; un même texte demandé par 'radio:message' et par speak() dans les 2 s n'est dit qu'une fois.

CE QUE LES AUTRES MODULES DOIVENT ÉMETTRE EUX-MÊMES par 'sfx' (je n'écoute PAS 'item:used', pour éviter les doubles) : grenade_lancer, lanceur_tir, lbd_tir, tir_arme, coup_baton, menottes, spray, extincteur, declencheur_photo, petard, mortier_tir. L'interface doit appeler ctx.audio.play('ui_clic' | 'ui_valide' | 'ui_alerte').

IDENTIFIANTS SUPPLÉMENTAIRES utilisables avec play() : pas_pave, pas_gravier, pas_herbe, pas_eau, sirene_gendarmerie, sirene_hurleur, collision, embrasement, batucada, tonnerre, radio_fin, radio_souffle, megaphone_clic, megaphone_fond, acouphene.

AJOUTER UN SON : 1) écrire une recette `(k: Kit) => durée` dans src/audio/recipes/ (outils du Kit : osc, noise, tex, bq, burst, ping, echoes, sustain, pulse, sat… ; retourner la durée, ou k.duration après k.sustain() pour un son entretenu) ; 2) l'inscrire dans src/audio/catalog.ts avec def(id, groupe, libellé, recette, { bus, priority, level, dist: [référence, portée], sustained, delayed, max }) ; 3) s'il est au contrat, l'ajouter à CONTRACT_SOUND_IDS (un test compare cette liste au texte de contracts.ts) ; 4) lancer `node tests/e2e/audio.mjs` : il est rendu hors ligne, contrôlé, ajouté aux planches de spectrogrammes et au banc d'essai /harness/audio.html. Le fichier catalog.ts rappelle cette marche à suivre en tête.

CONVENTION RETENUE : camYaw est un cap au sens du contrat (avant = (sin h, cos h)) ; regard vers +z, l'est (+x) est à gauche. C'est cohérent avec le service neutre du cœur (camYaw = aimYaw).

## Mesures

63 recettes de synthèse (48 SoundId du contrat + 15 supplémentaires), 13 textures procédurales. Module : 5 808 lignes (src/audio hors dev), outillage de banc d'essai : 1 610 lignes, tests unitaires : 1 864 lignes (219 tests), test de bout en bout : 352 lignes. Réserve : 32 voix simultanées, ambiances comprises. Coût de frame() : 0,02 ms en moyenne avec 120 manifestants. Crête de sortie sous une salve de 29 détonations : 0,921. Durée du test de bout en bout complet : environ 1 minute.

## Non fait / fragile

- Aucune écoute humaine : la crédibilité des timbres et l'équilibre des niveaux sont jugés sur spectrogrammes et mesures seulement. Un réglage à l'oreille dans harness/audio.html reste à faire, en particulier pour les voix de foule, le cri, la toux et la voix de mégaphone indistincte.
- Synthèse vocale réelle non entendue : Chromium headless n'expose aucune voix française (0 voix fr), donc dans le test de bout en bout seul l'habillage a joué. La logique (choix fr-FR, timbres, file, volume, pause, garde-fou) est testée avec un faux speechSynthesis.
- La voix de synthèse ne passe pas par WebAudio : elle n'est ni filtrée (l'effet radio/mégaphone vient uniquement des bips, du souffle, du clic et du larsen autour) ni spatialisée (seul son volume suit la distance, fixé au début de la phrase).
- Testé uniquement dans Chromium headless : ni Safari/iOS, ni téléphone réel, ni Firefox. Les précautions mobiles (déverrouillage au geste, tampon muet, repli sans StereoPanner, textures à 22 050 Hz) sont écrites mais non éprouvées sur appareil.
- Pas testé dans le jeu complet avec rendu : les modules de rendu, de véhicules, de foule et d'objets n'existaient pas encore. L'intégration réelle (ctx.view, vrais événements) reste à vérifier une fois la racine de composition assemblée.
- Je n'écoute pas 'item:used' : si le module des objets n'émet pas de 'sfx' à l'usage, les tirs (lanceur, LBD, arme), le coup de bâton, les menottes, la gazeuse, l'extincteur et le déclencheur photo resteront muets.
- Pas de réverbération par convolution ni de HRTF (choix « économique » demandé) : les échos de rue sont intégrés aux recettes des détonations, identiques quel que soit le lieu.
- Le timbre d'hélicoptère est sommaire (bruit haché + sifflement de turbine).
- harness/audio.ts n'est pas couvert par tsc (tsconfig n'inclut que src et tests/unit) ; il est volontairement mince, l'interface du banc est dans src/audio/dev/harnessUi.ts, qui est vérifiée.
- src/audio/dev/ (banc d'essai, faux contextes, analyse) se trouve sous src/ ; il n'est importé ni par index.ts ni par le reste du module, donc absent du jeu livré, mais il faudra l'exclure explicitement si un outil compte les fichiers de src/.

## Demandes d'évolution du contrat

- AudioApi.speak : ajouter aux options `megaphone?: boolean`, `priority?: 0 | 1 | 2` et `y?: number`. Le module les accepte déjà (SpeakExtra dans src/audio/api.ts) mais un appelant typé par le contrat ne peut pas les passer sans transtypage.
- SoundOptions : ajouter `text?: string` (slogan ou annonce dont la recette suit la prosodie : foule_slogans, megaphone) et `priority?: number`. Aujourd'hui le texte ne passe que par les événements crowd:chant et law:sommation.
- AudioApi : aucune méthode pour déplacer ou régler un son en cours (par ex. `update(handle, { x, y, z, volume, pitch })`). Un autre module ne peut donc pas attacher lui-même une boucle à un objet mobile ; le module audio suit seul sirènes, klaxons, moteurs, canon à eau, feux de véhicule et grenades qui émettent.
- SoundId : ajouter à l'union, pour l'autocomplétion, les identifiants supplémentaires déjà jouables : pas_pave, pas_gravier, pas_herbe, pas_eau, sirene_gendarmerie, sirene_hurleur, collision, embrasement, batucada, tonnerre, radio_fin, radio_souffle, megaphone_clic, megaphone_fond, acouphene.
- Vehicle.rpm : unité non précisée (tr/min réels ou valeur normalisée). Le module accepte les deux (≤ 1,5 = normalisé) et estime le régime d'après la vitesse si rpm vaut 0 ; à fixer dans le contrat.
- Vehicle.siren = 2 (« variante ») : sens non précisé. Je l'ai interprété comme le signal « hurleur » (balayage 650–1 450 Hz). À confirmer.
- 'vehicle:turret_fired' : rien n'indique la fin d'un jet continu de canon à eau. Je tiens la boucle 0,7 s après le dernier événement, ce qui suppose un événement répété tant que le jet dure ; un état (par ex. tourelle en train de tirer) ou un événement de fin serait plus sûr.
- PlayerState.camYaw : préciser que c'est un cap au sens du contrat (avant = (sin h, cos h)). C'est mon hypothèse pour le panoramique ; si la caméra utilise une autre convention, gauche et droite seront inversées.
- Molotov : préciser lequel de 'projectile:impact', 'explosion' et 'fire:started' est émis (ou s'ils le sont tous). Je fusionne les trois pour ne jouer qu'un embrasement, mais la règle mériterait d'être écrite.
- Dire dans le contrat ou l'architecture qui émet les 'sfx' d'usage des objets ('item:used' ne suffit pas à choisir un son sans risquer un doublon).

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/audio et tests/unit/audio.* (6 erreurs restantes, toutes dans des fichiers d'autres contributeurs)
- npx vitest run tests/unit/audio : 9 fichiers, 219 tests, tous verts (réserve de voix et priorités, atténuation/panoramique/passe-bas/Doppler, mixage de foule, prosodie, correspondances événement→son, catalogue comparé au texte de contracts.ts, textures, système complet sur faux contexte WebAudio, voix avec faux speechSynthesis)
- npx vitest run (suite entière) : mes 9 fichiers passent ; 3 échecs dans core.game et people-render.animator, qui ne m'appartiennent pas
- node tests/e2e/audio.mjs (Chromium headless) : [audio] OK, aucune erreur de page. 63 sons rendus dans un OfflineAudioContext, chacun avec 3 graines + en boucle pour les sons entretenus : échantillons finis, crête entre 0,08 et 0,985, pas de composante continue, fin du son dans la durée annoncée, boucles tenues sur toute la fenêtre
- Notes des sirènes mesurées dans le rendu : police 581,4 / 436,0 Hz, pompiers 489,9 / 436,0, SAMU 651,4 / 436,0, gendarmerie 732,1 / 436,0 (résolution de la mesure ≈ 5 Hz)
- Moteur complet branché sur un OfflineAudioContext stéréo (même test) : passage d'une sirène à 72 km/h — à droite puis à gauche (G 0,0024 / D 0,0331 → G 0,0344 / D 0,0029), note grave 463,0 Hz à l'approche et 414,5 Hz à l'éloignement ; mur : niveau 0,041 → 0,0145 et part d'aigus 22,5 % → 1,3 %, retour à 0,041 ; détonation à 5/20/80/320 m : niveaux décroissants, arrivée du son à 0,026 / 0,069 / 0,244 / 0,944 s ; salve de 29 détonations simultanées : crête en sortie 0,921
- Banc d'essai en temps réel (même test) : état « verrouillé » avant tout geste puis « running » après un clic ; page masquée → « suspended », visible → « running » ; volume général à 0 → niveau 0,238 → 0,0000 ; cortège de 120 → slogans 0,94 dominants, puis affrontement/colère → huées 0,95, puis peur → panique 0,95 ; 240 sons d'un coup → 32 voix réelles sur 32, sirène prioritaire conservée ; boucles sirène, moteur, pluie, ville actives ; pas du joueur déclenchés ; radio → bip + souffle ; sommation → voix de mégaphone
- Coût mesuré dans Chromium : frame() 0,02 ms en moyenne (2,6 ms au pire) avec 120 manifestants ; textures procédurales 9 à 39 ms chacune, calculées une par image après le déverrouillage
- Planches regardées avec l'outil Read : audio-01 à audio-11 (tous les spectrogrammes), audio-sirenes-zoom.png (deux notes alternées sur les repères 435/488/580/651/732 Hz), audio-prosodie.png (syllabes des slogans et de la sommation), audio-scene-passage.png (Doppler et bascule gauche/droite), audio-banc.png et audio-banc-foule.png (interface du banc d'essai). Le verre montre bien un éclat large bande suivi de tintements entre 2 et 10 kHz
- Corrections faites après avoir regardé les planches : notes des sirènes fausses (carré écrêté), échos de tir trop distincts (remplacés par une traîne diffuse), coupures nettes en fin de tôle/tambour (fondu final générique), images spectrales et consonnes trop marquées dans les voix de foule, niveaux écrêtés de 12 recettes
- Vérification ponctuelle avec le vrai cœur (createTestContext de src/core/testing, mode strict, headless) : branchement, session, événements, fin et redémarrage sans exception — test jetable, supprimé ensuite pour ne pas dépendre des fichiers d'un autre contributeur

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/audio/index.ts
- /home/user/SafeDeal/crs-simulation/src/audio/api.ts
- /home/user/SafeDeal/crs-simulation/src/audio/system.ts
- /home/user/SafeDeal/crs-simulation/src/audio/output.ts
- /home/user/SafeDeal/crs-simulation/src/audio/engine.ts
- /home/user/SafeDeal/crs-simulation/src/audio/voicePool.ts
- /home/user/SafeDeal/crs-simulation/src/audio/spatial.ts
- /home/user/SafeDeal/crs-simulation/src/audio/catalog.ts
- /home/user/SafeDeal/crs-simulation/src/audio/kit.ts
- /home/user/SafeDeal/crs-simulation/src/audio/instantiate.ts
- /home/user/SafeDeal/crs-simulation/src/audio/textures.ts
- /home/user/SafeDeal/crs-simulation/src/audio/voiceTextures.ts
- /home/user/SafeDeal/crs-simulation/src/audio/prosody.ts
- /home/user/SafeDeal/crs-simulation/src/audio/prng.ts
- /home/user/SafeDeal/crs-simulation/src/audio/crowdMix.ts
- /home/user/SafeDeal/crs-simulation/src/audio/ambienceDirector.ts
- /home/user/SafeDeal/crs-simulation/src/audio/mapping.ts
- /home/user/SafeDeal/crs-simulation/src/audio/wiring.ts
- /home/user/SafeDeal/crs-simulation/src/audio/speech.ts
- /home/user/SafeDeal/crs-simulation/src/audio/engineGraph.ts
- /home/user/SafeDeal/crs-simulation/src/audio/vehicleSounds.ts
- /home/user/SafeDeal/crs-simulation/src/audio/footsteps.ts
- /home/user/SafeDeal/crs-simulation/src/audio/fireLoops.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/weapons.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/impacts.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/human.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/objects.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/vehicles.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/radio.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/crowd.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/ambience.ts
- /home/user/SafeDeal/crs-simulation/src/audio/recipes/ui.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/analysis.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/board.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/offline.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/scene.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/fakeContext.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/fakeWebAudio.ts
- /home/user/SafeDeal/crs-simulation/src/audio/dev/harnessUi.ts
- /home/user/SafeDeal/crs-simulation/harness/audio.html
- /home/user/SafeDeal/crs-simulation/harness/audio.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/audio.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.voicepool.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.spatial.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.crowdmix.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.prosody.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.mapping.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.catalog.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.textures.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.system.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/audio.speech.test.ts
