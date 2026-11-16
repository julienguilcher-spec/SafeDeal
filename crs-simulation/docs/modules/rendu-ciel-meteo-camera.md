# Compte rendu — rendu:ciel-météo-caméra

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Les deux modules sont écrits, testés et vérifiés en image ; rien n'est branché dans src/main.ts (réservé à l'intégrateur) et contracts.ts n'a pas été touché. src/env publie ctx.env et le service 'env.ext' : horloge avec clockScale, vraies éphémérides de Paris au 1er mai 2026 (lever 6 h 30, culmination 56° à 13 h 48, coucher 21 h 07, pleine lune), lumière du jour, éclairage public avec hystérésis, sept temps avec transitions ordonnées, sol qui se mouille et sèche, vent à rafales lentes, éclairs, événements env:hour / env:weather, remise à zéro depuis ctx.session.config. src/render/base publie ctx.view et quatre services : renderer ACES/sRGB, quatre préréglages de qualité, ciel procédural en une passe (dégradé, soleil, brume d'horizon, étoiles, lune avec sa phase, nuages, ciel bouché, éclairs), soleil/lune + hémisphère + brouillard exponentiel accordé au ciel, pluie instanciée, effets d'écran en surcouches CSS, réserve de lumières dynamiques, rig de caméra à neuf modes. Les ombres utilisent THREE.SunLight de r187 (deux cascades ajustées au champ de la caméra, alignées sur les texels), au lieu d'une ombre unique faite main. Le rendu est appelé par un second système 'render.present' (ordre VIEW + 90), pour passer après tous les systèmes d'ordre VIEW et avant l'interface. En cours de route j'ai aligné le module sur trois modules écrits en parallèle : ajout de pulse() à 'render.lights' (le rendu des véhicules l'appelle à chaque image), sémantique des effets d'écran calée sur le HUD (niveaux tenus, sauf le flash qui retombe seul), rig calé sur le vrai contrôleur du joueur (cap absolu, engin télépiloté, fovScale du masque). La vérification porte sur 98 tests unitaires, le test de bout en bout complet (47 captures, toutes regardées au moins une fois pendant le réglage) et un passage sur le vrai moteur src/core avec ces deux seuls modules. Trois choix sont de mon fait et se discutent : l'horloge accélérée par défaut selon la durée de mission (×18 / ×8 / ×4 / ×1), la date fixe du 1er mai en heure d'été (à 20 h il fait encore grand jour), et le rig qui écrit PlayerState.camYaw en véhicule pour tourner avec lui.

## API publique et mode d'emploi

BRANCHEMENT (src/main.ts, à faire par l'intégrateur)
- `import { createSystems as env } from '@/env'` et `import { createSystems as renderBase } from '@/render/base'`, ajoutés à MODULES.
- Mettre renderBase AVANT les autres modules de rendu : à ordre égal (VIEW) les systèmes s'exécutent dans l'ordre d'ajout, la caméra est ainsi placée avant que personnages et véhicules se dessinent.
- Systèmes créés : 'env' (ordre 150), 'render.base' (ordre VIEW = 1000 : caméra, ciel, lumière, pluie, effets), 'render.present' (ordre 1090 : attribution des lumières dynamiques puis renderer.render).
- En headless ou sans WebGL, ctx.view reste nul et aucun service de rendu n'est publié.
- Le canevas est inséré dans #game ; les effets d'écran sont un div .crs-fx dans #game, au-dessus du canevas et sous #ui.
- Les objets du monde s'ajoutent à ctx.view.world. Ne pas ajouter de lumière directionnelle ni toucher à scene.fog : le module s'en charge.

ENVIRONNEMENT — ctx.env (EnvApi du contrat)
- state.timeOfDay est l'heure LÉGALE d'été au 1er mai 2026.
- state.sunX/Y/Z pointe vers le soleil tant qu'il est au-dessus de −3°, sinon vers la lune si elle est levée, sinon presque au zénith ; toujours unitaire et au moins 2,5° au-dessus de l'horizon.
- state.daylight est astronomique, réduit par ciel très chargé ; isNight = soleil sous −4°.
- setWeather(kind) lance une transition d'environ 1 à 2 min réelles ; setWeather(kind, true) est immédiat.
- setWind(x, z) impose le vent moyen, effet immédiat ; les rafales modulent autour ; setWind(0, 0) donne un calme plat exact.
- clockScale par défaut selon config.duration : courte 18, standard 8, longue 4, temps_reel 1.
- Options lues dans config.extra : clockScale, weatherDynamic, wind {x, z}, ou windSpeed + windHeading.
- La météo n'évolue d'elle-même qu'en mode 'monde_ouvert' ou avec extra.weatherDynamic.

ENVIRONNEMENT — service 'env.ext' (type EnvExtApi, `import type` depuis '@/env/api')
- sky : sunX/Y/Z réels (même sous l'horizon), sunElevation, sunAzimuth, moonX/Y/Z, moonElevation, moonPhase, dominant, lightning 0..1, lightningX/Z, windMeanX/Z, gust, cloudX/Z, ambient, day, sunrise, sunset, solarNoon.
- Membres : dynamicWeather, gustiness (0 = vent régulier), releaseWind(), strike(intensité), setWetness(v), target, transition, timeLabel() (« 14 h 05 »).
- EnvSystem.setDate(date) change de saison.
- Événement libre `ctx.events.onAny('env:lightning', {x, z, distance, intensity})` à chaque éclair.

RENDU — service 'render.lights' (RenderLightsApi)
- point(init) et spot(init) renvoient une DynamicLight : x, y, z, color, intensity (candelas), range, priority, enabled, flicker, dirX/Y/Z, angle, penumbra, shown, release().
- flash(x, y, z, couleur, intensité, portée, secondes) : éclat qui s'éteint seul.
- pulse(x, y, z, couleur, intensité, rayon) : lumière valable pour l'image en cours, à redemander dans frame() ; c'est ce qu'appelle déjà src/render/vehicles.
- Une lumière vit jusqu'à son release() ; la réserve ne la reprend jamais, pas même entre deux sessions.
- Budget réel points / projecteurs : bas 2/1, moyen 4/2, haut 8/3, ultra 12/4. On peut en créer bien plus : les plus importantes pour la caméra sont allumées, avec fondu.
- Ordres de grandeur d'intensité : gyrophare 15, feu de poubelle 45, candélabre 80, véhicule en feu 150, explosion 500.

RENDU — service 'render.uniforms' (RenderUniformsApi)
- uniforms, utilisables tels quels dans onBeforeCompile : uTime, uWetness, uRain, uWind (x, vitesse, z), uSunDir, uSunColor, uDaylight, uNight, uStreetLights, uFogColor (= scene.fog.color, déjà tone-mappée), uLightning, uSkyColor.
- Valeurs lisibles : wetness, night, streetLights (0..1, lissées).
- applyWetness(material, {darken, roughness, upOnly, sheen}) : rend un MeshStandardMaterial plus sombre et plus brillant avec le sol mouillé, plus un faux reflet du ciel à incidence rasante ; il conserve un onBeforeCompile existant.

RENDU — service 'render.base' (RenderBaseApi)
- stats (drawCalls, triangles, prepareMs, renderMs, width, height, pixelRatio, lightsWanted, lightsLit, rainStreaks), quality, shadows, visibility, exposure, sun, hemisphere, paused.
- snap() : à appeler après un saut d'heure ou de météo ; clearScreenEffects() ; renderNow().

RENDU — ctx.view
- drawDistance VARIE : min(réglage, plafond du préréglage), réduite par le brouillard (environ 80 m), relevée en vue tactique.
- setScreenEffect : 'gas', 'wet', 'visor', 'pain' sont des niveaux tenus ; 'flash' est une impulsion qui retombe seule, à rappeler pour l'entretenir.
- shake(amount 0..1, secondes).

CAMÉRA — service 'render.camera' (RenderCameraApi)
- mode, tpsDistance, cut(), project(x, y, z, out), placeFree(x, y, z), free.
- tactical : x, z, height, zoom, inputPan, setCenter(), pan().
- Options : vehicleYawFollow, vehicleAutoCenter, headBob, gearFov.

CE QUE LE RIG ATTEND DE PlayerState
- camYaw : cap ABSOLU, avant = (sin yaw, cos yaw), comme Person.aimYaw.
- camPitch : site, positif vers le haut.
- zoom : zoom optique, 1 = champ du réglage fov (vertical). En vue tactique, hauteur = 150 m / (zoom × tactical.zoom), bornée de 30 à 700 m.
- cameraMode incohérent corrigé : 'fps' ou 'tps' à bord deviennent vehicle_int ou vehicle_ext ; un mode véhicule à pied devient fps ou tps.
- En véhicule, le rig ÉCRIT camYaw : il y ajoute la rotation du véhicule, puis recentre derrière lui en vue extérieure après 1,4 s sans mouvement de regard (options ci-dessus pour couper).
- Tourelle : la caméra regarde selon camYaw / camPitch, pas selon l'orientation de la tourelle ; le n-ième siège 'gunner' sert la n-ième tourelle.
- Drone : la caméra suit camPitch tel quel, plafonné à +0,2 rad ; le contrôleur met −0,5 à la prise en main.
- Vue tactique : avec inputPan, le rig lit les axes de déplacement et zoom_in / zoom_out de ctx.input ; le module qui passe dans ce mode doit mettre controlEnabled = false, sinon le personnage marche en même temps.
- Sans personnage incarné : travelling circulaire d'attente au-dessus du point de départ.

SERVICES FACULTATIFS CONSULTÉS PAR LE RIG
- 'player.control' : remoteVehicleId (engin télépiloté), fovScale (masque, visière) appliqué en vue subjective.
- 'vehiclesRender' : seatEye(v, seat, out) pour la vue intérieure.

## Mesures

CPU JavaScript sous Node, par appel, selon les passes (machine partagée, 4 cœurs, charge 20 à 35)

| Appel | Coût |
|---|---|
| env.update, orage | 4 à 8 µs |
| computeAtmosphere | 3 à 6 µs |
| rig.update, fps | 1 à 2,5 µs |
| rig.update, tps avec collision contre 60 immeubles | 3 à 4 µs |
| lights.update, 30 lumières virtuelles | 4 à 8 µs |
| lights.update, 200 lumières virtuelles | 28 à 40 µs |

- Allocations résiduelles : 0 à 160 octets par appel.
- Dans le navigateur (Chromium headless, WebGL logiciel), la préparation d'une image par le module (caméra, ciel, lumière, pluie, effets) prend 0,10 à 0,4 ms en régime établi, avec des pics de 1 à 6 ms sur l'image qui suit un changement de météo ou de mode.

Appels de dessin
- Le module en ajoute 1 pour le ciel et 1 pour la pluie quand il pleut ; les lumières dynamiques n'en ajoutent aucun.
- Scène du banc d'essai (environ 102 000 triangles) : 24 appels sans ombre en qualité basse, 64 avec les deux cascades en moyen, haut et ultra.

Préréglages

| | bas | moyen | haut | ultra |
|---|---|---|---|---|
| Ombre par cascade | aucune | 1024 | 2048 | 4096 |
| Portée des ombres | — | 90 m | 140 m | 220 m |
| Anticrénelage | non | oui | oui | oui |
| Plafond de densité de pixels | 1,5 | 1,5 | 2 | 2 |
| Distance d'affichage max | 300 m | 500 m | 900 m | 1500 m |
| Traits de pluie max | 700 | 2200 | 4500 | 8000 |
| Lumières points / projecteurs | 2 / 1 | 4 / 2 | 8 / 3 | 12 / 4 |

Mesuré dans le test de bout en bout
- Pluie sous averse : 668 traits en bas, 7638 en ultra.
- Nuit en qualité haute : 8 lumières allumées sur 31 à 32 demandées.
- Finesse des ombres en haut : moins de 6 cm par texel près de la caméra, moins de 30 cm pour la seconde cascade.
- Visibilité : 476 m par temps clair (réglage 500), 243 m sous la pluie, 164 m sous l'averse, 66 m dans le brouillard.
- Téléphone simulé (844×390 points, densité 3, qualité basse, échelle 0,7) : tampon 886×409, densité effective 1,05, 23 appels de dessin.

Coût GPU réel : non mesuré.

## Non fait / fragile

- Aucune mesure sur un vrai GPU ni sur un vrai téléphone : l'objectif de 30 images/s en qualité basse n'est pas vérifié ; sous WebGL logiciel, renderMs (2 à 46 ms en 960×540) ne dit rien d'un GPU réel
- Jamais exécuté avec les vrais modules contrôleur du joueur, rendu des personnages, rendu des véhicules et HUD ensemble : l'alignement (pulse, seatEye, fovScale, remoteVehicleId, sémantique du HUD) vient de la lecture de leur code et de tests avec des doublures
- L'anticrénelage est fixé à la création du contexte WebGL : passer de 'bas' à une autre qualité en jeu applique tout le reste, mais l'AA ne change qu'au rechargement
- Pas de carte d'environnement : les matériaux métalliques ne reflètent que soleil, hémisphère et lumières ; le reflet du sol mouillé est un faux reflet de la couleur du ciel
- Pluie : pas d'éclaboussures au sol et pas d'abri (il pleut aussi sous un porche, faute d'information de couverture)
- Ombres : rien au-delà de la portée du préréglage (90 / 140 / 220 m) et les immeubles lointains ne projettent pas dans la zone ; la direction du soleil est transmise par pas de 0,25°, soit un léger recalage toutes les 7 s environ à l'horloge ×8
- Le brouillard de scène n'a qu'une couleur : au couchant le lointain se fond dans une teinte moyenne, pas dans l'orange côté soleil
- Tourelle : la caméra suit le regard du joueur, pas la tourelle (qui suit à vitesse bornée) ; pendant la rotation, le centre de l'écran n'est pas le point visé par l'arme
- Vue tactique 3D : aucun module ne l'active encore ; le déplacement intégré est inactif quand un écran modal est ouvert et suppose que l'appelant coupe controlEnabled
- Tonnerre non synchronisé : le module audio joue son propre tonnerre aléatoire par temps d'orage ; mes éclairs n'émettent qu'un événement libre
- Date fixe au 1er mai 2026 : la lune est toujours presque pleine et le soleil se couche à 21 h 07 ; une mission réglée à « 20 h » est en plein jour (sunrise / sunset sont exposés pour les menus, setDate existe mais rien ne l'appelle)
- Les effets d'écran sont des surcouches DOM : flou CSS du canevas pour le gaz, coupé en qualité basse ; jamais essayé sur Safari ni Firefox
- Allocations : aucune création d'objet, de tableau ou de fermeture dans les boucles chaudes, mais il reste 30 à 160 octets par appel mesurés, que j'attribue aux flottants écrits dans des champs d'objets sans l'avoir prouvé par profilage
- Le test de bout en bout complet dure 24 à 40 min sur cette machine partagée (4 cœurs, WebGL logiciel) : à lancer par groupes (ambiances, cameras, effets, qualite, moteur) plutôt qu'en entier

## Demandes d'évolution du contrat

- GameEvents : ajouter 'env:lightning': { x: number; z: number; distance: number; intensity: number } (aujourd'hui émis par emitAny), pour que l'audio cale le tonnerre sur l'éclair
- SessionConfig : ajouter le vent (wind?: { x: number; z: number }), la vitesse de l'horloge (clockScale?: number) et la météo évolutive (weatherDynamic?: boolean) ; aujourd'hui lus dans config.extra
- EnvApi / EnvState : ajouter setWetness(value) et la position réelle des astres (hauteur du soleil, direction et phase de la lune), aujourd'hui dans le service 'env.ext'
- Déclarer dans contracts.ts l'interface du service 'render.lights' (point, spot, flash, pulse) : src/render/vehicles en déclare déjà une version réduite sous la même clé
- ViewApi.setScreenEffect : préciser la sémantique (niveaux tenus, 'flash' en impulsion) et ajouter clearScreenEffects()
- PlayerState : écrire que camYaw / camPitch sont absolus et que le rig de caméra peut écrire camYaw en véhicule ; exposer l'engin télépiloté et le facteur de champ dans PlayerApi plutôt que dans le service 'player.control'
- SystemOrder : ajouter une constante PRESENT entre VIEW et UI (j'utilise VIEW + 90) pour l'appel de renderer.render
- ViewApi.drawDistance : préciser qu'elle varie avec la météo et le mode de caméra

## Vérifications exécutées

- npx vitest run tests/unit/env tests/unit/render-base → 9 fichiers, 98 tests passés (course du soleil est / sud / ouest et horaires réels, pleine lune, transitions météo, mouillage et séchage, vent, éclairs, préréglages, atmosphère, neuf modes de caméra et collision, lumières dont pulse, alignement des cascades d'ombre sur les texels, effets d'écran, intégration au vrai moteur)
- npx tsc --noEmit → 0 erreur dans src/env, src/render/base et mes tests ; harness/render.ts vérifié à part avec un tsconfig temporaire (0 erreur), car harness/ n'est pas dans l'include du projet
- node tests/e2e/render.mjs (complet, sur le code final figé par sommes de contrôle) → [render] OK en 1445 s, 47 captures dans tests/e2e/out/render-*.png, aucune erreur de page ; les contrôles couvrent ombres, éclairage public, budget de lumières, pluie, visibilité du brouillard, mode de caméra appliqué, recul dos au mur < 1,5 m puis > 3 m en terrain dégagé, qualité basse sans ombre, tampon téléphone < 420 000 px, dispose() sans reste
- Captures regardées avec Read pendant le réglage : midi clair, nuageux, fin d'après-midi dorée, deux couchers, crépuscule, nuit, nuit de lune, couvert, pluie, averse, averse de nuit, brouillard, orage, éclair, aube, chaque mode de caméra, gaz, flash, gouttes, douleur, visière, qualités bas et ultra, téléphone, moteur réel — toutes n'ont pas été rouvertes après le tout dernier passage
- Mode moteur réel (harness/render.html?moteur=1, inclus dans le test de bout en bout) : Game + session de src/core avec env et renderBase → ctx.view publié, systèmes env:150, render.base:1000, render.present:1090, session en cours, météo et clockScale de la configuration appliqués, 0 erreur de système
- Repli sans module env (harness ?env=neutre) : capture de jour correcte ; test unitaire sur 24 h avec l'environnement neutre du vrai moteur, sans saut de lumière
- Banc de mesure Node (script jetable hors dépôt) : coûts CPU par appel de env.update, computeAtmosphere, rig.update et lights.update — chiffres dans metrics
- docs/research revérifié en fin de travail : 7 dossiers présents ; seul le 00 touche mon sujet (dérive du gaz = vent × 0,8, seuil de 15 km/h), d'où un vent publié en m/s avec moyenne et rafales séparées

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/env/index.ts
- /home/user/SafeDeal/crs-simulation/src/env/api.ts
- /home/user/SafeDeal/crs-simulation/src/env/system.ts
- /home/user/SafeDeal/crs-simulation/src/env/astro.ts
- /home/user/SafeDeal/crs-simulation/src/env/weather.ts
- /home/user/SafeDeal/crs-simulation/src/env/mathx.ts
- /home/user/SafeDeal/crs-simulation/src/env/dev/fakeContext.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/index.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/api.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/system.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/view.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/quality.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/atmosphere.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/sky.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/lighting.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/rain.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/lights.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/screenFx.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/uniforms.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/cameraRig.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/cameraMath.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/cameraFollow.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/cameraTactical.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/util.ts
- /home/user/SafeDeal/crs-simulation/src/render/base/dev/fakeContext.ts
- /home/user/SafeDeal/crs-simulation/harness/render.html
- /home/user/SafeDeal/crs-simulation/harness/render.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/render.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/env.astro.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/env.system.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/env.weather.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/env.integration.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/render-base.quality.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/render-base.atmosphere.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/render-base.camera.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/render-base.lights.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/render-base.ombres-effets.test.ts
