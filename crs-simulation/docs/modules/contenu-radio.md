# Compte rendu — contenu:radio

> Généré automatiquement à partir du rapport de l'étape. Référence pour les développeurs suivants.


## Résumé

Module RADIO livré dans src/gameplay/radio/ : GameSystem « radio » (order RULES − 50, index.ts exporte createSystems). Il remplace ctx.radio et publie les services 'radio.phrases', 'radio.callsigns' et 'radio.control'.

1. say() : journal horodaté à l'instant réel de diffusion, événement radio:message et sous-titre ctx.ui.subtitle pour la priorité ≥ 1. File d'attente par canal sans chevauchement, avec durée estimée d'après la longueur du texte. Les urgents passent devant. L'ambiance est abandonnée après 8 s d'attente, les messages normaux après 90 s, les urgents après 150 s. File plafonnée à 16 par canal. Anti-répétition par émetteur et texte normalisé : 90 s pour l'ambiance, 20 s en priorité normale, 8 s en urgent. Voix stable = hashString(indicatif) % 6. La synthèse vocale reste à l'audio, qui écoute radio:message.

2. Indicatifs fictifs conformes à la bible E.5 : CENTRAL, commandant unique « MISTRAL 0 » (alias commissaire compris), compagnie MISTRAL (modifiable par session.config.extra.compagnie), sections « MISTRAL n », groupes « MISTRAL n ALFA/BRAVO/CHARLIE », ÉPERVIER, FAUCON, CENTAURE 1, NEPTUNE 1, ICARE, LIAISON, SANTÉ 1, SAPEUR 1. Forme dite : « MISTRAL DEUX ». Fonction callsign(squad | personne | id). Un nom d'unité déjà au format « MISTRAL 7 » est conservé, et les moyens spéciaux sont reconnus par leur nom.

3. Bibliothèque ctx.provide('radio.phrases', { say(clé, paramètres, options), text, variants, has, info, keys }) : 152 situations, 3 à 5 variantes chacune, toutes les situations demandées par le brief. Chaque message est composé « APPELÉ ICI APPELANT. corps. PARLEZ./TERMINÉ. ». Les nombres sont dits un par un (45 → QUATRE-CINQ, 5000 → CINQ MILLE). Chaque paramètre a une valeur par défaut, donc aucune accolade ne survit. Le lieu est déduit de la position de l'unité via ctx.world.sectorName. UN/UNE s'accorde au singulier. Typographie française : espaces insécables avant ; : ! ? et dans les guillemets, apostrophe typographique. Toutes les clés sont documentées dans src/gameplay/radio/PHRASES.md, avec rôles, canal, priorité, paramètres et exemple rendu.

4. Ambiance (RadioAmbient) : un message de priorité 0 toutes les 20 à 40 s, premier message entre 8 et 16 s. Le thème dépend de la phase du directeur et de la tension (9 phases, 17 thèmes). Le message reprend l'unité de police réelle, son secteur et son effectif, le volume de foule arrondi à l'estime, l'heure et la météo. Le dernier thème est pénalisé et la même variante ne revient pas de suite. Désactivable par ctx.require('radio.control').ambient = false, ou par session.config.extra.radioAmbiance === false.

5. Tests : 4 fichiers, 50 tests verts (radio.queue, radio.phrases, radio.callsigns, radio.ambient).

## API publique et mode d'emploi

import { createSystems, RADIO_PHRASES_SERVICE, RADIO_CALLSIGNS_SERVICE, RADIO_CONTROL_SERVICE } from '@/gameplay/radio'. Types exportés : RadioPhrases, CallsignBook, RadioControl, SayOptions, PhraseParams, PhraseInfo, RadioStats. ctx.radio (RadioApi du contrat) : say(msg), log, clear(). RadioPhrases : say(clé, params?, options?) retourne boolean, text(clé, params?, variante = 0), variants(clé, params?), has(clé), info(clé), keys. SayOptions : { squad, at, personId, from, channel, priority, variant }. CallsignBook : central, company, commandant, callsign(squad | personne | id), spoken(indicatif), voiceOf(indicatif), special('canon' | 'centaure' | 'drone' | 'bravm' | 'samu' | 'pompiers' | 'liaison'). RadioControl : ambient (lecture/écriture), subtitles (lecture/écriture), stats { broadcast, repeated, dropped, pending }, pending(canal), busyUntil(canal), flush().

## Non fait / fragile

- Sous-titres en double possible : ui/core/system.ts affiche déjà un sous-titre à chaque radio:message de priorité ≥ 1 (msg.from, msg.text), et ce module appelle aussi ctx.ui.subtitle comme demandé. Pour n'en avoir qu'un, désactiver l'un des deux : ctx.require('radio.control').subtitles = false, ou retirer l'abonnement côté UI. Fichier ui/core/system.ts non modifié, il n'est pas à moi.
- Pas de bip radio ni de ctx.audio.speak ici : l'audio synthétise déjà la voix sur radio:message (audio/wiring.ts), donc les appeler doublerait la voix.
- Aucune phrase n'est câblée dans les autres modules (ils doivent appeler phrases.say avec les clés de PHRASES.md). Les messages existants de law, ui/command et items passent par ctx.radio.say et profitent déjà de la file et de l'anti-répétition. L'indicatif « AUTORITÉ » du module law reste tel quel, alors que le commandant unique est « MISTRAL 0 » ici : à aligner.
- Les unités créées par d'autres modules sont nommées d'après leur kind, leur nom et leur ordre de création, sans lecture de leur propre champ « indicatif ». L'ambiance ne choisit que des unités de police avec membres.
- PHRASES.md est généré par un script temporaire (supprimé) : à régénérer à la main si les variantes changent. Un test vérifie seulement que toutes les clés y figurent.
- Les clés incident_*, secours_*, metro_* et rue_* décrivent les échanges, mais aucun lien automatique n'existe avec les services 'incidents', 'rescue.dispatch' ou 'crowd.metro' : c'est à ces modules d'appeler la bibliothèque.
- Rien n'a été commité (non demandé).

## Vérifications exécutées

- npx vitest run tests/unit/radio : 4 fichiers, 50 tests verts (relancé après la dernière modification).
- npx tsc --noEmit : aucune erreur dans les fichiers radio (filtre sur « radio »).
- File : alternat sans chevauchement, urgent avant normal, abandon de l'ambiance après 8 s, anti-répétition selon la priorité, file saturée qui évince le moins important, services publiés, journal horodaté, événement radio:message, voix stable, sous-titres coupés pour l'ambiance, remise à zéro à la nouvelle session.
- Phrases : 152 clés (≥ 90), 3 à 5 variantes distinctes chacune. Pour toutes les clés, toutes les variantes et 10 jeux de paramètres hostiles (absents, vides, null, nombres négatifs, NaN, Infinity, accolades injectées), aucun texte ne garde d'accolade ni de « undefined/NaN ». say() sur toutes les clés : journal sans accolade. Tout paramètre employé a une valeur par défaut.
- Texte et forme : forme « APPELÉ ICI APPELANT. … PARLEZ. » et chiffres épelés, accord « UN mètre », espaces insécables avant ; : ! ? et dans les guillemets. Contrôle de neutralité : aucun nom de parti, syndicat, marque ou personne parmi ceux testés. PHRASES.md liste toutes les clés (vérifié par test).
- Ambiance : thèmes tous présents dans la bibliothèque en priorité 0 ; cohérence phase/thème (pas de combat au rassemblement, pas de calme plat à l'affrontement) ; écarts entre messages compris entre 20 et 44 s ; reflète unité, secteur et effectif réels ; suit un changement de phase ; désactivable et réactivable ; interdite par extra.radioAmbiance ; déterminisme (même graine = même journal, graine différente = journal différent).
- Fichiers générés ou temporaires (générateur de PHRASES.md, débogage) supprimés de tests/unit ; seuls les 4 fichiers radio.*.test.ts y restent.

## Fichiers

- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/index.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/api.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/text.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/queue.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/callsigns.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrase-lib.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/ambient.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/PHRASES.md
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/define.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/defaults.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/a-mise-en-place.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/b-violences-force.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/c-manoeuvres-incidents.ts
- /home/user/SafeDeal/crs-simulation/src/gameplay/radio/phrases/d-moyens-fin-ambiance.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/radio.queue.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/radio.phrases.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/radio.callsigns.test.ts
- /home/user/SafeDeal/crs-simulation/tests/unit/radio.ambient.test.ts
