# Compte rendu — interface:accueil-hud

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Le socle de l'interface, la page d'accueil, le HUD et les menus sont écrits, exécutés et vérifiés dans le banc d'essai : 97 tests unitaires verts, 0 erreur tsc dans mes fichiers, et une passe de bout en bout complète (398 vérifications, 0 échec, aucune erreur de page) aux trois tailles. Rien n'a été essayé dans le vrai jeu : `main.ts` ne branche encore aucun module, et aucun appareil réel n'a servi (Chromium headless, émulation tactile, manette simulée).

Après cette passe complète, j'ai ajouté quatre petites choses (choix du lieu par clic sur le mini-plan, entrées « Personnalisation » et « Garage », service `ui.widgets`, trois descriptions de rôle raccourcies). Les parties « parcours » (55) et « écrans » (102) ont été rejouées et passent ; les parties « HUD » et « manette » n'ont pas été rejouées depuis.

- **Socle** : un système d'ordre `SystemOrder.UI` publie `ctx.ui`, `EXT.uiKit` (l'interface d'`extensions.ts`, telle quelle) et `EXT.objectives`. Il gère la pile d'écrans, la pause automatique, le retour arrière, la navigation au focus (clavier et manette) et les touches d'interface, qui n'ouvrent un écran que s'il est enregistré.
- **Page d'accueil** : neuf sections couvrent tous les réglages demandés, avec un résumé permanent, « Lancer », « Surprends-moi », « Continuer » et les scénarios enregistrés. Ce qui n'est pas un champ de `SessionConfig` part dans `config.extra`.
- **HUD** : au plus six indicateurs permanents selon le rôle, la caméra et le siège, plus les éléments contextuels (réticule et charge, invite, coups reçus, effets d'écran, véhicule, drone, viseur, marqueurs 3D). Au repos il n'écrit rien dans le DOM.
- **Écrans** : paramètres (six onglets, réaffectation des touches, export / import / effacement), pause, chargement, compte rendu, crédits.
- **Agrégation** : `src/ui/index.ts` charge `maps/` et `command/` par `import.meta.glob`. Ces deux dossiers sont apparus pendant le travail et fonctionnent avec le socle : touches M et Tab, mini-carte et éléments d'unité dans mes zones sans chevauchement.

Trois choix de ma part, à valider :
- L'interface applique elle-même, à la première image jouée, le vent (`EnvApi.setWind`), la coupure de circulation (`closeArea`) et la fermeture des stations (`setOpen`) dans un rayon de 350 m.
- Elle sous-titre elle-même `radio:message` (priorité ≥ 1) et `law:sommation`, avec dédoublonnage.
- « Ordres » et « Radio » ne font qu'ouvrir leur écran, et seulement hors écran modal : à la manette ces touches sont aussi la croix, et la roue d'ordres gère déjà sa fermeture.

À faire côté intégrateur : le panneau de diagnostic de `main.ts` (affiché quand `ctx.view` est nul) est ajouté après ma racine dans `#ui` et recouvrirait la page d'accueil.

## API publique et mode d'emploi

BRANCHEMENT
Dans `src/main.ts` : `import { createSystems as ui } from '@/ui';` puis l'ajouter à `MODULES`. `createSystems` rend le système `'ui'` (ordre `SystemOrder.UI`), suivi des systèmes de `src/ui/maps/index.ts` et `src/ui/command/index.ts` s'ils existent (`import.meta.glob` eager : ne pas les ajouter une seconde fois). Types publics : `import type … from '@/ui/core/api'`.
- `provide()` crée `div.crs-ui` dans `#ui` (repli : `body`), injecte la feuille de style `#crs-ui-style`, remplace `ctx.ui` et enregistre mes écrans.
- `init()` monte le HUD et s'abonne aux événements.
- En headless, seul `EXT.objectives` est publié ; `ctx.ui` reste l'interface neutre et aucun DOM n'est touché.

SERVICES FOURNIS
- `ctx.ui` (UiApi) : `notify` (pile de 4, une seule visible sur écran bas, doublons comptés « ×n »), `subtitle` (2 lignes au plus, ignoré si `Settings.subtitles` est faux), `banner`, `open(id, data)`, `close(id?)`, `modal`, `current`.
- `EXT.uiKit` (`'ui.kit'`) : `root` (= `#ui`), `registerScreen`, `hasScreen`, `addHudWidget`, `removeHudWidget`, `h`, `button`, `focusGroup`, `keyLabel`.
- `EXT.objectives` (`'ui.objectives'`) : ObjectivesApi + `version`. `tracked` se cale seul sur le premier objectif principal actif et localisé ; la liste est vidée à chaque `reset()`.
- `'ui.widgets'` : classe `Widgets` — `button`, `iconButton`, `slider`, `segmented`, `toggle`, `card`, `chip`, `stepper`, `tabs`, `field`, `sectionTitle`, `confirm`.
- `'ui.debug'` : `stack`, `hudVisible`, `hudWidgets()`, `notices()`, `focused()`.

SERVICES CONSOMMÉS (tous facultatifs)
- `'launch'` (`nomenu`), `'perf'`.
- `'input.touch'`, `'input.labels'`, `'input.bindings'`, `'input.pointer'`.
- `'missions'`, `'roles.causes'` : lecture tolérante, formes décrites dans `api.ts` (`MissionLike`, `MissionResultLike`, `CauseLike`).
- `'world.map2d'` : méthode `draw` de `Map2dService` (`src/ui/maps/api.ts`).
- `'law.records'`, `EXT.incidents`, `EXT.traffic`, `EXT.metro`.

ÉVÉNEMENTS ÉCOUTÉS
`session:phase`, `session:started`, `radio:message`, `law:sommation`, `person:hurt`, `media:shot`, `settings:changed`, et l'événement libre `'ui:loading'` `{ progress: 0..1, label? }` (`ctx.events.emitAny`).

ÉCRANS ENREGISTRÉS
- `'menu_principal'` (données `{ section? }`) : ouvert quand la phase passe à `'menu'`, sauf `?nomenu=1`.
- `'parametres'` (données `{ tab? }`), `'pause'`, `'credits'`.
- `'chargement'` : ouvert en phase `'loading'`, fermé à `'playing'`.
- `'debrief'` : ouvert en phase `'debrief'`.
- Une pause posée par un autre module ouvre `'pause'` ; une reprise extérieure ferme les écrans qui tenaient la pause.

TOUCHES D'INTERFACE (lues dans `frame()`, en jeu seulement ; table `HOTKEY_SCREENS`)
- `pause` → `'pause'`.
- `map` → `'carte'`, `tactical` → `'carte_tactique'` : bascule, l'une remplace l'autre, jamais par-dessus un menu.
- `orders` → `'ordres'` ou `'roue_ordres'`, `radio` → `'radio'` : ouverture seule, hors écran modal.
- `ui_back` : propose `ui:back` à l'élément focalisé, puis `back()` de l'écran du dessus, sinon le ferme.

AJOUTER UN ÉCRAN (depuis `init()` d'un module)
`kit.registerScreen('mon_ecran', (host, data) => ({ update?(dt, input), back?(), dispose() }), { modal, pauses, hidesHud })`, puis `ctx.ui.open('mon_ecran', data)`.
- Un groupe de focus est posé d'office sur `host`, et le focus initial va à `[data-autofocus]` ou au premier élément.
- Les écrans sous un écran modal passent en `inert`.
- Événements DOM utiles : `ui:nav` (`{ dir }`, annulable — un curseur garde gauche / droite), `ui:back` (annulable), `ui:tab` (`{ step }`, sur LB / RB).
- Classes prêtes à l'emploi : `ui-panel`, `ui-btn`, `ui-tabs`, `ui-list`, `ui-slider`, `ui-seg`, `ui-toggle`, `ui-card`, `ui-chip`, `ui-stepper`, `ui-gauge`, `ui-scroll`, `ui-window`.
- La page d'accueil affiche une entrée « Carrière », « Missions », « Personnalisation », « Garage » dès que l'écran `'carriere'`, `'missions'`, `'personnalisation'`, `'garage'` est enregistré.

AJOUTER UN ÉLÉMENT DE HUD
`kit.addHudWidget('mon.id', zone, (host) => ({ update?(dt), dispose() }))`, avec `zone` parmi `top-left`, `top`, `top-right`, `left`, `right`, `bottom-left`, `bottom`, `bottom-right`, `center`.
- En tactile, les zones se décalent seules hors de la surcouche du module d'entrées.
- Les notifications et les sous-titres se placent d'après la hauteur réelle des zones `top` et `bottom`.
- Habillage : classe `hud-box` ; un élément ne doit pas dépasser `max-width: 100 %` de sa zone.

CLÉS DE `config.extra` (type `ScenarioExtra`)
`scenario: 1`, `poste`, `variante`, `cause`, `causeLabel`, `composition` (9 familles, somme 1), `vent { direction, vitesse }`, `derapage`, `moyens { sections, fourgons, centaure, canon_eau, bravm, drone, pompiers, samu, secours_sur_appel }`, `options { sanctions, violence, circulation, metro }`.

SAUVEGARDE
Section `'scenarios'` de `ctx.save` : `{ v: 1, last, items: [{ id, name, savedAt, config }] }`.

BANC D'ESSAI
`/harness/ui.html`, paramètres décrits en tête de `harness/ui.ts` ; API de test `window.__uiTest`.

## Non fait / fragile

- Jamais essayé dans le vrai jeu : main.ts ne branche aucun module. Le HUD n'a été vu que sur la scène 2D du banc d'essai (vraie caméra en perspective, ctx.view factice), pas sur le rendu 3D
- Aucun appareil réel : ni vraie manette, ni iOS / Android, ni clavier AZERTY physique
- Parties « HUD » et « manette » du test de bout en bout non rejouées après les quatre derniers ajouts (clic sur le mini-plan, entrées Personnalisation / Garage, service ui.widgets, trois descriptions de rôle)
- Panneau de diagnostic de main.ts : il recouvrirait la page d'accueil tant qu'aucun module de rendu ne fournit ctx.view (fichier de l'intégrateur, non modifié)
- Catalogue de missions filtré par rôle seulement, pas par type ; lu par une lecture tolérante faute de contrat, et essayé uniquement avec trois missions factices
- Carrière : aucune progression réelle (module absent) ; la page l'explique et propose l'écran 'carriere' s'il est enregistré
- Lieu : places seulement, pas de parcours ; le plan sélectionne le lieu proposé le plus proche du point touché, pas un point libre
- Coupure de circulation et fermeture des stations au départ : écrites contre EXT.traffic et EXT.metro mais jamais exécutées avec de vrais modules (absents) ; seul le vent est vérifié
- « Sanctions actives », « Qui dérape », moyens engagés, cause, composition : transmis dans config.extra seulement ; sans module qui les lise, ils n'ont aucun effet
- Compte rendu : le dossier 'law.records' n'a été essayé qu'avec des données factices, pas avec le vrai module du droit
- Éléments de HUD propres à certains rôles du dossier 06 non faits : chevrons d'alignement, « vous êtes filmé », télémètre et angle de tir, séquence légale à cinq cases avec minuteries, mosaïque de caméras du Centaure, vue thermique, fiche de victime, note du cadre
- « Suspect désigné » : ce sont les incidents de type 'suspect' d'EXT.incidents ; le contrat n'a pas de désignation propre
- Batterie du drone : lue dans ItemStack.state de 'telecommande_drone' (hypothèse) ; masquée si l'objet manque
- Intensités des effets d'écran (gaz ×0,25 sous masque, douleur, eau) : estimations de ma part
- Import de sauvegarde : les paramètres en mémoire ne sont relus qu'après rechargement de la page (bouton proposé)
- Saisie du nom d'un scénario à la manette : pas de clavier à l'écran, un nom est proposé d'office
- Navigation au focus : pas de bouclage ; un curseur garde gauche / droite, d'où Start qui amène le focus sur « Lancer »
- Écrans en portrait ou de moins de 700 px de large : non conçus
- Infobulles : survol et focus seulement, rien au doigt
- Sous-titres : si un module appelle ctx.ui.subtitle avec un autre nom d'émetteur que celui de radio:message, la réplique s'affichera deux fois
- Aucun commit effectué : ce n'était pas demandé

## Demandes d'évolution du contrat

- extensions.ts : définir MissionsApi (catalogue { id, title, roles, type, difficulty, summary, place, config } et résultat { title, success, score, grade, summary, lines }) avec sa clé dans EXT ; aujourd'hui lecture tolérante dans src/ui/screens/services.ts
- extensions.ts : définir le service des causes de manifestation ('roles.causes' : { id, label }[]) et sa clé dans EXT
- extensions.ts : y déplacer Map2dService ('world.map2d'), aujourd'hui dans src/ui/maps/api.ts, et ajouter les clés 'law.records', 'ui.maps', 'ui.command', 'ui.widgets'
- contracts.ts, SessionConfig : documenter les clés d'extra écrites par la page d'accueil (type ScenarioExtra de src/ui/core/api.ts), ou promouvoir en champs le poste et le vent
- contracts.ts, GameEvents : ajouter 'ui:loading' { progress: number; label?: string }, pour que les modules de chargement l'émettent de façon typée
- contracts.ts, PlaceInfo : ajouter une importance (elle existe dans places.json) ; sans elle, les lieux principaux sont retrouvés par mots-clés parmi 279 places
- contracts.ts, Button : ajouter « onglet précédent / suivant » pour les menus ; j'emploie item_prev / item_next (LB / RB)
- contracts.ts : prévoir la batterie ou l'autonomie d'un engin (drone) et une désignation de suspect (PlayerState ou service) ; le HUD les déduit aujourd'hui d'ItemStack.state et des incidents 'suspect'
- ARCHITECTURE.md §5 ou extensions.ts : inscrire la table touches → écrans (pause → 'pause', map → 'carte', tactical → 'carte_tactique', orders → 'roue_ordres', radio → 'radio') et la règle « Ordres et Radio n'ouvrent que hors écran modal »
- main.ts (intégrateur) : ne pas monter le panneau de diagnostic quand le module d'interface est branché

## Vérifications exécutées

- npx tsc --noEmit : 0 erreur dans src/ui/{index.ts,core,hud,screens} et tests/unit/ui.* (14 erreurs restantes, toutes dans src/sim/crowd, d'un autre contributeur)
- tsc avec un tsconfig temporaire incluant harness/ui.ts : 0 erreur
- npx vitest run tests/unit/ui. : 9 fichiers, 97 tests réussis (construction du SessionConfig et aller-retour avec une configuration, « Surprends-moi » sur 500 graines, scénarios enregistrés, pile d'écrans et pause automatique, choix du voisin au focus, objectifs, profil du HUD ≤ 6 indicateurs pour tout rôle × caméra × siège, cadre légal, boussole, projection des marqueurs, formats français, lecture tolérante des services, système en headless et index agrégé avec maps/ et command/)
- Deux défauts trouvés par les tests unitaires et corrigés : marqueur d'une cible située derrière la caméra envoyé du mauvais côté ; famille « en tête » du tirage aléatoire parfois sous 30 % du cortège
- node tests/e2e/ui.mjs, passe complète : 398 vérifications, 0 échec, aucune erreur de page ni console.error (environ 13 min sur cette machine)
- Après les derniers ajouts : parties « parcours » (55 vérifications) et « écrans » aux trois tailles (102) rejouées, 0 échec ; parties « HUD » et « manette » non rejouées depuis la passe complète
- Chaque écran à 1280×720, 844×390 (tactile) et 1180×820 (tactile) : 9 sections de l'accueil, 6 onglets des paramètres, crédits, chargement, pause, compte rendu minimal et complet — rien hors écran, aucun libellé coupé, cibles ≥ 44 px en tactile
- HUD aux trois tailles dans 11 situations (CRS calme, affrontement de nuit avec gaz, commissaire, Centaure, canon à eau, moto, drone, viseur, manifestant, street medic sous la pluie, sans module de rendu) : aucun chevauchement entre éléments ni avec les commandes de la vraie surcouche tactile, au plus six indicateurs permanents
- HUD, valeurs contrôlées : jauge de charge à 62 %, arc du coup reçu, effets gaz / douleur / visière envoyés à ctx.view, voile de repli sans ctx.view, 24/30 grenades, 6 200 L d'eau, altitude 58 m et batterie 78 %, focale 70 mm, deux sommations sur trois, rappel du droit pour un civil, barre d'objets tactile alimentée en noms français
- Parcours souris et clavier : réglages répercutés dans le résumé, choix du lieu par clic sur le mini-plan, enregistrer / renommer / charger / supprimer un scénario, lancement avec SessionConfig et extra vérifiés, vent appliqué à ctx.env, Échap sans double bascule de la pause, Entrée sans double validation, paramètres au clavier, pause et reprise par un autre module, compte rendu, retour à l'accueil, « Continuer » à l'identique (même graine)
- Paramètres : export, import refusé pour un texte étranger puis accepté, effacement avec confirmation ; entrées « Carrière » et « Missions » présentes seulement si leurs écrans sont enregistrés ; infobulle ; bandeau ; chargement à 42 % reçu par ui:loading
- Sans module d'entrées (services neutres) : flèches, Entrée et Échap lus par l'interface, section « Touches » qui explique l'absence, partie lancée
- Parcours à la manette simulée (navigator.getGamepads remplacé), 24 vérifications dans la passe complète : rôle, lieu, heure et affluence réglés à la croix, LB / RB entre sections, répétition quand la direction est tenue, Start puis A pour lancer, partie démarrée avec les valeurs réglées, Start / B pour la pause
- Intégration (informative, sans assertion) avec maps/ et command/ agrégés et les vraies données de Paris (2 984 lieux, 20 082 arêtes) : mini-plan sur fond de vraies rues, attribution réelle dans les crédits, HUD avec mini-carte et éléments d'unité sans chevauchement, M ouvre 'carte', Tab ouvre 'carte_tactique'
- Mesures en Chromium headless : HUD au repos, 0 mutation du DOM en 1 s ; regard en rotation, 7,2 écritures par image (transformations) ; système « ui », 0,46 ms par image en moyenne
- Construction de production d'essai (vite build sur le banc d'essai, sortie hors dépôt) : réussie, import.meta.glob et import JSON compris
- Captures regardées avec Read, dans tests/e2e/out/ui-*.png (106 fichiers) : accueil (rôle, lieu, météo, manifestation, moyens) aux trois tailles, paramètres (graphismes, touches, sauvegarde), pause, chargement, compte rendu, crédits, confirmation, bandeau, HUD bureau / téléphone / tablette dans les situations ci-dessus, parcours manette, intégration
- Corrigé après examen des captures et des contrôles automatiques : remises à zéro CSS qui écrasaient les couleurs des composants, cartes de rôle trop hautes, libellés tronqués, panneau légal trop large, marqueurs et sous-titres sur les boutons tactiles, bandeaux du drone et du viseur qui recouvraient d'autres éléments, notifications sur le panneau de situation et les boutons système, « droite » depuis un onglet qui n'entrait pas au premier réglage

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/ui/index.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/api.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/system.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/kit.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/screens.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/focus.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/components.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/notices.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/objectives.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/dom.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/format.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/icons.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/css/base.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/css/hud.ts
- /home/user/SafeDeal/crs-simulation/src/ui/core/css/screens.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/hud.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/types.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/layout.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/model.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/situation.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/compass.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/objectives.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/status.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/items.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/center.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/vehicle.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/cameras.ts
- /home/user/SafeDeal/crs-simulation/src/ui/hud/markers.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/index.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/home.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/home-panes-a.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/home-panes-b.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/catalog.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/scenario.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/scenarios-store.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/services.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/miniplan.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/settings.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/settings-bindings.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/pause.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/loading.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/tips.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/debrief.ts
- /home/user/SafeDeal/crs-simulation/src/ui/screens/credits.ts
- /home/user/SafeDeal/crs-simulation/harness/ui.html
- /home/user/SafeDeal/crs-simulation/harness/ui.ts
- /home/user/SafeDeal/crs-simulation/tests/e2e/ui.mjs
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.scenario.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.surprise.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.scenarios-store.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.screens.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.focus.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.objectives.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.hud-model.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.format.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/ui.system.test.ts
