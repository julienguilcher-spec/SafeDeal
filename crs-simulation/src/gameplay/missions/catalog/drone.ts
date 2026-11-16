/* =====================================================================================
 * Catalogue — télépilote de drone (indicatif « ICARE ») : voir, désigner, guider.
 * Le drone ne tire pas : il repère les signes avant-coureurs et guide les unités.
 * Détachement facultatif de la carrière (chapitre 11), dans un périmètre de vol autorisé.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_02 } from './commandant';
import { CRS_05 } from './crs';
import { BRAVM_02 } from './bravm';

const PILOTE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'telepilote', rank: 'brigadier_chef', poste: 'telepilote' };

export const DRONE_01 = mission({
  ...PILOTE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 11,
  id: 'drone-01-arrete-prefectoral',
  title: 'Arrêté préfectoral',
  pitch: 'Premier vol : décoller dans le périmètre autorisé, ne jamais le quitter et rendre compte de la zone.',
  briefing: [
    `Esplanade des Invalides, un matin clair. Un arrêté préfectoral autorise le vol d'un drone de surveillance dans un périmètre de trois cents mètres autour de l'esplanade, à cent mètres d'altitude maximum. Vous êtes télépilote : votre unité vole sous l'indicatif « ICARE ».`,
    `Votre mission est de décoller, de rester dans le périmètre autorisé et sous le plafond de cent mètres, de survoler trois points de contrôle et de rendre compte à la radio. Un franchissement du périmètre rend le vol illégal.`,
    `Vérifiez la batterie, la météo et le périmètre sur la carte. Décollez au signal. Suivez le trajet entre trois balises. Si la batterie passe sous vingt pour cent, rentrez. Annoncez chaque balise : « Balise 1, RAS. »`,
    `Le drone ne filme pas les domiciles : respectez les consignes de floutage. Un drone qui sort du périmètre est immédiatement rappelé. La batterie est une contrainte réelle.`,
  ],
  place: 'Esplanade des Invalides', timeOfDay: 9.5, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ drone: true }),
  intel: intel('Périmètre autorisé de trois cents mètres, plafond de cent mètres.', 'Aucun signalement.', ['Esplanade des Invalides'],
    ['Vérifier batterie et météo', 'Rester dans le périmètre', 'Rentrer sous vingt pour cent de batterie']),
  phases: [
    ph('decollage', 'Décollage', 'Contrôles et décollage autorisé.', T(45),
      [['ICARE', 'CENTRAL ICI ICARE. Décollage, périmètre vérifié. PARLEZ.']], []),
    ph('balises', 'Trois balises', 'Vous survolez les trois balises du parcours.', T(120),
      [['ICARE', 'CENTRAL ICI ICARE. Balise UN, RAS. PARLEZ.']], ['Un coup de vent déporte le drone']),
    ph('retour', 'Retour', 'Vous revenez poser le drone.', FIN,
      [['CENTRAL', 'ICARE ICI CENTRAL. Atterrissage autorisé. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Survoler les trois balises sans sortir du périmètre', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Rester sous le plafond de cent mètres', 'personnalise', { target: 'plafond_altitude', max: 100 }),
    os('o3', 'Rentrer avec plus de vingt pour cent de batterie', 'personnalise', { target: 'batterie', count: 20 }),
  ],
  failures: [fail('personnalise', 'Franchissement du périmètre : vol illégal.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Un coup de vent déporte le drone', 'Un oiseau croise la trajectoire'],
  unique: 'Le drone est contraint par la loi : le périmètre de vol est la première règle.',
  tags: ['formation', 'drone'],
});

export const DRONE_02 = mission({
  ...PILOTE, ...scene(CDT_02), difficulty: 4, chapter: 11, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'drone-02-les-signes',
  title: 'Les signes',
  pitch: 'Dans le précortège du boulevard du Temple, repérer changements de tenue, parapluies et dépavage pour prévenir le commandant avant le premier jet.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Un précortège de trois cents personnes se forme en avant des huit mille marcheurs déclarés. Vous pilotez le drone d'appui du commandant, dans un périmètre de vol qui englobe tout le boulevard. Vous voyez ce que personne ne voit.`,
    `Votre mission est de repérer au moins trois signes avant-coureurs (changements de tenue, parapluies déployés, dépavage, barrières de chantier tirées) et de les signaler au commandant avant le premier jet. Plus tôt vous parlez, plus le commandant a de choix.`,
    `Volez à soixante mètres au-dessus de la tête de cortège. Balayez les groupes. Annoncez : « Nature, volume, attitude. » Désignez les blocs avec un marquage. N'orientez pas la caméra vers les fenêtres. Gardez le contact visuel avec la tête.`,
    `Une fausse alerte coûte autant qu'un oubli. Ne désignez que ce que vous voyez. Marquez les individus, pas la foule. Votre batterie dure vingt-cinq minutes.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés, un précortège de trois cents personnes en tête.',
    'Une centaine d\'individus déterminés en noir, avec parapluies.', ['Boulevard du Temple', 'Rue de Turbigo', 'Rue du Temple'],
    ['Voler à soixante mètres', 'Annoncer nature, volume, attitude', 'Marquer les individus, pas la foule']),
  phases: [
    ph('attente', 'Surveillance du rassemblement', 'Vous survolez le rassemblement de la place de la République.', T(240),
      [['ICARE', 'CENTRAL ICI ICARE. Fumigène noir, parapluies ouverts, changements de tenue : un bloc se forme à hauteur du kiosque. PARLEZ.']], []),
    ph('depart', 'Départ', 'Le précortège avance sans attendre le camion sono.', TENS(0.45),
      [['ICARE', 'CENTRAL ICI ICARE. Nébuleuse de tête : QUATRE-ZÉRO-ZÉRO personnes devant la banderole, visages qui se couvrent. PARLEZ.']], ['Dépavage à l\'angle du boulevard']),
    ph('affrontement', 'Affrontement', 'Le bloc attaque la ligne.', FOULE('dispersion'),
      [['ICARE', 'CENTRAL ICI ICARE. Barrières de chantier tirées en travers, UN-CINQ individus. PARLEZ.']], []),
    ph('fin', 'Dispersion', 'Le précortège reflue.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Dispersion visible vers le canal. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Repérer trois signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Désigner le bloc au commandant en moins de deux minutes', 'guider_unite', { target: 'bloc', seconds: 120 }),
    os('o3', 'Ne produire aucune fausse alerte', 'personnalise', { target: 'fausse_alerte', max: 0 }),
    os('o4', 'Rester dans le périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
  ],
  failures: [fail('personnalise', 'Aucun signalement à temps.'), fail('personnalise', 'Vol hors du périmètre autorisé.')],
  randomEvents: ['Un coup de vent déporte le drone', 'Une fausse alerte de parapluies', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Voir avant : le drone transforme les phases calmes en temps utile.',
  tags: ['signes', 'miroir'],
});

export const DRONE_03 = mission({
  ...PILOTE, ...scene(CRS_05), difficulty: 3, chapter: 11, mirrorOf: CRS_05.id, altRoles: ['crs'],
  id: 'drone-03-avant-les-autres',
  title: 'Avant les autres',
  pitch: 'Sur le boulevard Beaumarchais, repérer trois signes avant-coureurs dans le précortège et prévenir la salle avant le premier jet.',
  briefing: [
    `Boulevard Beaumarchais, manifestation déclarée. Votre drone surveille le précortège depuis soixante mètres. Un lanceur de la section est en position. Vous êtes le premier à voir le danger, ce qui vous donne une responsabilité.`,
    `Votre mission est de repérer trois signes avant-coureurs et de prévenir la salle avant le premier jet. Chaque signalement doit comporter le lieu, le nombre et l'attitude des individus concernés.`,
    `Balayez la tête de cortège. Cherchez les changements de tenue, les parapluies, les regroupements. Annoncez au fur et à mesure. Ne vous focalisez pas sur un seul point : le vent tourne et la foule avec lui.`,
    `Un signalement trop tardif ne sert à rien ; un signalement erroné use la confiance de la salle. Prévenez à la voix, sans dramatiser.`,
  ],
  intel: intel(
    'Neuf cents personnes ; un précortège violent isolé.',
    'Une trentaine d\'individus déterminés au nord du boulevard.', ['Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Voler à soixante mètres', 'Annoncer lieu, nombre, attitude', 'Ne pas se focaliser sur un point']),
  phases: [
    ph('survol', 'Survol de la tête de cortège', 'Vous suivez la tête depuis la Bastille.', T(180),
      [['ICARE', 'CENTRAL ICI ICARE. Tête de cortège à DEUX-ZÉRO-ZÉRO mètres, calme apparent. PARLEZ.']], []),
    ph('signes', 'Premiers signes', 'Parapluies et changements de tenue en tête.', TENS(0.55),
      [['ICARE', 'CENTRAL ICI ICARE. Parapluies ouverts, changements de tenue, TROIS-ZÉRO individus. PARLEZ.']], ['Un groupe sort des sacs à dos']),
    ph('alerte', 'Alerte', 'Vous alertez avant le premier jet.', TENS(0.5),
      [['CENTRAL', 'ICARE ICI CENTRAL. Reçu, nous mettons le dispositif en alerte. PARLEZ.']], []),
    ph('fin', 'Après les jets', 'Vous suivez la réaction de la section.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Reflux des individus vers le nord. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Signaler trois signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Prévenir la salle en moins de trente secondes après chaque repérage', 'guider_unite', { target: 'salle', seconds: 30 }),
    os('o3', 'Ne produire aucune fausse alerte', 'personnalise', { target: 'fausse_alerte', max: 0 }),
    os('o4', 'Suivre le groupe jusqu\'à sa dispersion', 'guider_unite', { target: 'groupe' }),
  ],
  failures: [fail('personnalise', 'Aucun signalement à temps.'), fail('personnalise', 'Vol hors du périmètre autorisé.')],
  randomEvents: ['Une fausse alerte', 'Un coup de vent', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Le drone est l\'œil qui voit avant les autres.',
  tags: ['signes', 'miroir'],
});

export const DRONE_04 = mission({
  ...PILOTE, ...scene(BRAVM_02), difficulty: 4, chapter: 11, mirrorOf: BRAVM_02.id, altRoles: ['bravm'],
  id: 'drone-04-fil-d-ariane',
  title: 'Fil d\'Ariane',
  pitch: 'Guider une colonne de motos vers un groupe mobile à travers les passages et les arcades, sans perdre le contact visuel plus de dix secondes.',
  briefing: [
    `Boulevard Montmartre, la nuit. Un cortège sauvage d'environ quatre-vingts personnes remonte les Grands Boulevards en brisant des vitrines. La BRAV-M le suit en colonne de six binômes. Votre drone est le seul à voir par-dessus les toits.`,
    `Votre mission est de guider la colonne de motos vers le groupe mobile par l'itinéraire le plus rapide, de ne jamais perdre le contact visuel plus de dix secondes et de désigner sans erreur les trois cibles.`,
    `Volez à cinquante mètres. Annoncez les carrefours : « Groupe au carrefour, trente mètres devant vous. » Utilisez le marquage pour désigner. Prévenez la colonne des impasses et des obstacles. Suivez les ruelles qu'elle ne voit pas.`,
    `Une désignation erronée envoie la colonne sur un innocent. La nuit réduit votre vision : activez la caméra thermique à la demande. Le drone vole dans le périmètre autorisé.`,
  ],
  intel: intel(
    'Quatre-vingts personnes en groupe mobile ; trois cibles identifiées.',
    'Une soixantaine d\'individus encagoulés.', ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'],
    ['Voler à cinquante mètres', 'Désigner avec le marquage', 'Prévenir des impasses']),
  phases: [
    ph('suivi', 'Suivi du groupe', 'Vous suivez le groupe depuis le ciel.', T(180),
      [['ICARE', 'FAUCON UN ICI ICARE. Groupe de HUIT-ZÉRO, tenue noire, carrefour dans TROIS-ZÉRO-ZÉRO mètres. PARLEZ.']], []),
    ph('guidage', 'Guidage de la colonne', 'Vous guidez les motos par les ruelles.', TENS(0.65),
      [['ICARE', 'FAUCON UN ICI ICARE. Tournez à gauche, rue de Richelieu, groupe à TROIS-ZÉRO mètres. PARLEZ.']], ['Une impasse bloque la colonne']),
    ph('designation', 'Désignation', 'Vous désignez les trois cibles.', FOULE('dispersion'),
      [['ICARE', 'FAUCON DEUX ICI ICARE. Cible désignée, veste verte, à CINQ-ZÉRO mètres. PARLEZ.']], []),
    ph('fin', 'Fin du guidage', 'Le groupe est dispersé.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Groupe dispersé. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Guider la colonne jusqu\'au groupe sans perdre le contact plus de dix secondes', 'guider_unite', { target: 'colonne_bravm', seconds: 10 }),
    ob('o2', 'Désigner trois cibles sans erreur', 'reperer_signaux', { count: 3 }),
    os('o3', 'Prévenir la colonne des impasses', 'personnalise', { target: 'impasse', count: 2 }),
    os('o4', 'Rester dans le périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
  ],
  failures: [fail('personnalise', 'Désignation erronée.'), fail('personnalise', 'Contact visuel perdu plus de trente secondes.', 30)],
  randomEvents: ['Une impasse bloque la colonne', 'Un feu de poubelle masque la vue', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Un fil d\'Ariane aérien : le drone est le guide de la colonne dans le labyrinthe.',
  tags: ['guidage', 'miroir', 'nuit'],
});

export const DRONE_05 = mission({
  ...PILOTE, type: 'emeute_nocturne', difficulty: 4, chapter: 11,
  id: 'drone-05-douze-foyers',
  title: 'Douze foyers',
  pitch: 'La nuit, douze foyers à l\'infrarouge : les compter, les hiérarchiser et orienter les secours.',
  briefing: [
    `Rue Saint-Antoine, minuit. Douze foyers de feu sont allumés dans un rayon de quatre cents mètres : poubelles, scooters, barricades, une camionnette. La fumée est épaisse. Les pompiers hésitent à entrer. Votre drone est équipé d'une caméra thermique.`,
    `Votre mission est de localiser tous les foyers, de les hiérarchiser par danger et d'orienter les pompiers et le canon à eau vers les plus urgents, en évitant les zones occupées par des groupes violents.`,
    `Survolez à quatre-vingts mètres. Utilisez la caméra thermique. Marquez les foyers par ordre de danger : camionnette, scooters, barricade, poubelles. Annoncez la fumée et la direction du vent. Signalez les groupes à éviter.`,
    `Ne confondez pas un foyer avec un groupe de personnes : la caméra thermique les montre tous les deux. Préférez l'identification visuelle avant désignation aux secours. La batterie est limitée à vingt minutes.`,
  ],
  place: 'Rue Saint-Antoine', timeOfDay: 0, weather: 'brouillard', windFrom: 240, windSpeed: 2,
  crowd: crowd(300, '', 0.6, 0.7, 0.3, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Rue Saint-Antoine', 'Boulevard Henri IV', 'Place de la Bastille'], 0.1),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 3, samu: 1 }),
  intel: intel(
    'Trois cents personnes dans la fumée ; douze foyers actifs.',
    'Une soixantaine d\'individus déterminés autour des foyers.', ['Rue Saint-Antoine', 'Boulevard Henri IV'],
    ['Hiérarchiser les foyers', 'Utiliser la caméra thermique', 'Signaler le vent']),
  phases: [
    ph('inventaire', 'Inventaire des foyers', 'Vous comptez les foyers.', T(180),
      [['ICARE', 'CENTRAL ICI ICARE. TROIS foyers actifs, fumée épaisse, visibilité réduite. PARLEZ.']], []),
    ph('hierarchie', 'Hiérarchie', 'Vous les classez par danger.', T(360),
      [['ICARE', 'CENTRAL ICI ICARE. Priorité : camionnette en feu, rue de Birague. PARLEZ.']], ['Un nouveau foyer s\'allume']),
    ph('orientation', 'Orientation des secours', 'Vous guidez pompiers et canon à eau.', TENS(0.7),
      [['SANTÉ 1', 'ICARE ICI SANTÉ UN. Nous suivons votre marquage. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les foyers sont éteints un à un.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Tous les foyers sont marqués et traités. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Localiser et marquer douze foyers', 'reperer_signaux', { count: 12 }),
    ob('o2', 'Hiérarchiser les trois foyers les plus dangereux', 'guider_unite', { target: 'foyer', count: 3 }),
    os('o3', 'Orienter les pompiers sans les exposer', 'proteger_site', { target: 'pompiers' }),
    os('o4', 'Signaler la direction du vent', 'personnalise', { target: 'vent' }),
  ],
  failures: [fail('personnalise', 'Un foyer dangereux n\'est pas signalé.'), fail('victime_non_secourue', 'Un pompier est exposé faute de désignation.')],
  randomEvents: ['Un nouveau foyer s\'allume', 'La batterie baisse vite', 'Un tir de feu d\'artifice vers le drone', 'La fumée masque la caméra'],
  unique: 'Voir à travers la fumée : l\'infrarouge est le seul regard utile.',
  tags: ['nuit', 'thermique', 'feux'],
});

export const DRONE_06 = mission({
  ...PILOTE, type: 'evenement_festif', difficulty: 3, chapter: 11,
  id: 'drone-06-densite-critique',
  title: 'Densité critique',
  pitch: 'Au Champ-de-Mars, une foule dense, des issues qui se ferment : repérer la compression avant la bousculade.',
  briefing: [
    `Champ-de-Mars, soir de feu d'artifice. Trois mille personnes sont massées sur les pelouses, face à la Tour Eiffel. Des issues sont fermées par des barrières. Une sortie du métro déverse une nouvelle vague. La densité devient inquiétante.`,
    `Votre mission est de repérer les zones de densité critique, supérieure à quatre personnes au mètre carré, de les signaler à la salle, de guider les secours et d'orienter la foule vers les issues ouvertes.`,
    `Volez à quatre-vingts mètres. Mesurez la densité par carré. Annoncez les compressions. Proposez des ouvertures de barrières. Guidez les ambulances. Annoncez les issues libres.`,
    `Une bousculade dans une foule dense est une catastrophe. Ne perdez jamais de vue les zones rouges. Le drone ne vole pas au-dessus de la foule à moins de cinquante mètres.`,
  ],
  place: 'Champ-de-Mars', timeOfDay: 22, weather: 'clair', windFrom: 250, windSpeed: 2,
  crowd: crowd(3000, '', 0.2, 0.4, 0.01, { fetards: 0.5, familles: 0.2, curieux: 0.3 },
    ['Champ-de-Mars', 'Avenue de la Bourdonnais', 'Quai Branly'], 0.6),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 2, samu: 2 }),
  intel: intel(
    'Trois mille personnes ; densité forte sous la Tour Eiffel.',
    'Aucun radical.', ['Champ-de-Mars', 'Avenue de la Bourdonnais', 'Quai Branly'],
    ['Mesurer la densité par carré', 'Annoncer les issues libres', 'Guider les secours']),
  phases: [
    ph('arrivee', 'Arrivée de la foule', 'La foule grossit sous la Tour Eiffel.', T(240),
      [['ICARE', 'CENTRAL ICI ICARE. Densité élevée sous la Tour, TROIS personnes au mètre carré. PARLEZ.']], []),
    ph('compression', 'Compression', 'Une sortie de métro déverse une vague.', TENS(0.4),
      [['ICARE', 'CENTRAL ICI ICARE. Densité critique devant le barrage, plus de QUATRE personnes au mètre carré, aucune issue ouverte. PARLEZ.']], ['Une barrière cède']),
    ph('ouverture', 'Ouverture d\'une issue', 'Vous proposez l\'ouverture d\'une barrière.', FOULE('dispersion'),
      [['CENTRAL', 'ICARE ICI CENTRAL. Barrière ouverte, avenue de la Bourdonnais. PARLEZ.']], []),
    ph('fin', 'Retour au calme', 'La foule s\'écoule.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Densité normale. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Signaler toutes les zones à plus de quatre personnes au mètre carré', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Proposer l\'ouverture d\'au moins une issue', 'guider_unite', { target: 'issue', count: 1 }),
    os('o3', 'Guider les ambulances vers les malaises', 'secourir', { target: 'malaise', count: 2 }),
    os('o4', 'Ne pas voler à moins de cinquante mètres de la foule', 'personnalise', { target: 'distance_foule' }),
  ],
  failures: [fail('trop_de_blesses', 'Bousculade grave.', 10), fail('personnalise', 'Vol sur la foule à basse altitude.')],
  randomEvents: ['Une barrière cède', 'Un malaise dans la foule', 'Un drone privé gêne le vol', 'La batterie baisse vite'],
  unique: 'La densité est invisible à pied : le drone est le seul à la voir à temps.',
  tags: ['densite', 'fete'],
});

export const DRONE_07 = mission({
  ...PILOTE, type: 'manifestation_interdite', difficulty: 4, chapter: 11,
  id: 'drone-07-hors-perimetre',
  title: 'Hors périmètre',
  pitch: 'L\'action se déplace hors du polygone de vol autorisé : continuer à renseigner depuis l\'intérieur, sans franchir la limite.',
  briefing: [
    `Place de la République, manifestation interdite. Un arrêté préfectoral limite le vol à un polygone de quatre cents mètres. Au bout d'un quart d'heure, un groupe violent quitte la place et s'engage sur le boulevard de Magenta, hors du périmètre.`,
    `Votre mission est de continuer à renseigner la salle sans franchir la limite : rester à l'intérieur, annoncer ce que vous voyez, signaler le départ du groupe, demander l'extension du périmètre si nécessaire.`,
    `Surveillez la carte : la limite apparaît en rouge. Approchez-vous du bord sans le franchir. Annoncez : « Groupe sort de mon périmètre, direction nord. » Demandez une autorisation d'extension à la salle.`,
    `Un drone hors périmètre est illégal : c'est la faute la plus grave. Ne cédez pas à la pression de la salle. Une demande d'extension doit être formelle, par écrit et horodatée.`,
  ],
  place: 'Place de la République', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(700, 'libertes', 0.5, 0.65, 0.15, { gilets_jaunes: 0.3, black_bloc: 0.15, militants: 0.2, curieux: 0.35 },
    ['Place de la République', 'Boulevard de Magenta'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Sept cents personnes ; un groupe violent quitte la place après un quart d\'heure.',
    'Une centaine d\'individus déterminés.', ['Place de la République', 'Boulevard de Magenta'],
    ['Surveiller la limite en rouge', 'Annoncer le départ du groupe', 'Demander l\'extension par écrit']),
  phases: [
    ph('vol', 'Vol dans le périmètre', 'Vous surveillez la place.', T(240),
      [['ICARE', 'CENTRAL ICI ICARE. Place sous surveillance, périmètre respecté. PARLEZ.']], []),
    ph('depart', 'Départ du groupe', 'Un groupe quitte la place par le nord.', TENS(0.6),
      [['ICARE', 'CENTRAL ICI ICARE. Groupe sort de mon périmètre, direction nord. PARLEZ.']], ['La salle réclame de suivre le groupe']),
    ph('extension', 'Demande d\'extension', 'Vous demandez par écrit l\'extension du périmètre.', FOULE('dispersion'),
      [['CENTRAL', 'ICARE ICI CENTRAL. Extension en cours d\'instruction. Restez dans le périmètre. PARLEZ.']], []),
    ph('fin', 'Fin', 'Le groupe disparaît.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Groupe hors de portée. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Ne jamais franchir la limite du périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
    ob('o2', 'Signaler le départ du groupe à la salle', 'reperer_signaux', { count: 1 }),
    os('o3', 'Demander l\'extension par écrit', 'personnalise', { target: 'extension_perimetre', count: 1 }),
    os('o4', 'Garder le contact visuel jusqu\'à la limite', 'guider_unite', { target: 'groupe' }),
  ],
  failures: [fail('personnalise', 'Vol hors du périmètre autorisé : faute grave.'), fail('revocation', 'Vol illégal répété.')],
  randomEvents: ['La salle réclame de suivre le groupe', 'Un drone privé gêne le vol', 'La batterie baisse vite', 'Rafale de vent'],
  unique: 'Le droit limite l\'œil : la loi fixe la frontière du regard.',
  tags: ['perimetre', 'droit'],
});

export const DRONE_08 = mission({
  ...PILOTE, type: 'catastrophe', difficulty: 4, chapter: 11,
  id: 'drone-08-thermique',
  title: 'Thermique',
  pitch: 'Dans la fumée, la nuit, retrouver un blessé au sol et trois foyers, et guider les secours.',
  briefing: [
    `Quai de Gesvres, à deux heures du matin. Le feu d'une barricade a gagné un entrepôt de livraison. La fumée est noire et dense. Un manifestant s'est effondré au sol, introuvable à l'œil. Trois foyers actifs menacent les immeubles voisins.`,
    `Votre mission est de retrouver le blessé en moins de quatre minutes grâce à la caméra thermique, de localiser les trois foyers et de guider les secours en évitant les zones à risque d'explosion.`,
    `Volez à quarante mètres. Activez le thermique. Balayez en zigzag. Un point chaud isolé au sol est un blessé. Annoncez et marquez. Guidez le SAMU par la voie la plus courte. Signalez les bouteilles de gaz.`,
    `Ne confondez pas un foyer et un blessé : le blessé a une silhouette. La fumée peut gêner l'image : volez plus bas si nécessaire. Respectez la distance de sécurité de trente mètres.`,
  ],
  place: 'Quai de Gesvres', timeOfDay: 2, weather: 'brouillard', windFrom: 200, windSpeed: 1,
  crowd: crowd(80, '', 0.4, 0.4, 0.1, { curieux: 0.6, fetards: 0.4 },
    ['Quai de Gesvres', 'Pont d\'Arcole'], 0.05),
  forces: forces({ drone: true, pompiers: 3, samu: 1 }),
  intel: intel(
    'Quatre-vingts personnes dans la fumée ; un blessé introuvable.',
    'Aucun radical.', ['Quai de Gesvres', 'Pont d\'Arcole'],
    ['Utiliser le thermique', 'Balayer en zigzag', 'Signaler les bouteilles de gaz']),
  phases: [
    ph('recherche', 'Recherche du blessé', 'Vous balayez la zone en zigzag.', T(240),
      [['ICARE', 'CENTRAL ICI ICARE. Recherche en cours, fumée épaisse. PARLEZ.']], []),
    ph('trouve', 'Blessé repéré', 'Un point chaud au sol, silhouette humaine.', T(420),
      [['ICARE', 'CENTRAL ICI ICARE. URGENT. UN blessé au sol, immobile, à QUATRE-ZÉRO mètres. PARLEZ.']], ['Une bouteille de gaz explose']),
    ph('guidage', 'Guidage des secours', 'Vous guidez le SAMU.', TENS(0.5),
      [['SANTÉ 1', 'ICARE ICI SANTÉ UN. Nous suivons votre marquage. PARLEZ.']], []),
    ph('fin', 'Évacuation', 'Le blessé est évacué.', FIN, [['SANTÉ 1', 'ICARE ICI SANTÉ UN. Blessé évacué. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Retrouver le blessé en moins de quatre minutes', 'secourir', { target: 'blesse_au_sol', count: 1, seconds: 240 }),
    ob('o2', 'Localiser les trois foyers', 'reperer_signaux', { count: 3 }),
    os('o3', 'Guider le SAMU par la voie la plus courte', 'guider_unite', { target: 'samu' }),
    os('o4', 'Signaler les bouteilles de gaz', 'reperer_signaux', { target: 'gaz', count: 1 }),
  ],
  failures: [fail('victime_non_secourue', 'Le blessé n\'est pas trouvé en quatre minutes.', 240), fail('personnalise', 'Vol dans la zone d\'explosion.')],
  randomEvents: ['Une bouteille de gaz explose', 'La fumée masque la caméra', 'La batterie baisse vite', 'Un second blessé apparaît'],
  unique: 'Un drone sauve une vie : la recherche thermique remplace des dizaines d\'yeux.',
  tags: ['nuit', 'secours', 'thermique'],
});

export const DRONE_09 = mission({
  ...PILOTE, type: 'manifestation_declaree', difficulty: 3, chapter: 11,
  id: 'drone-09-comptage',
  title: 'Comptage',
  pitch: 'De la Bastille à la République, compter le cortège à dix pour cent près, mesurer sa longueur et signaler deux points de compression.',
  briefing: [
    `Boulevard Beaumarchais, un cortège déclaré remonte les boulevards, de la Bastille à la République. Les organisateurs annoncent quinze mille personnes, la préfecture dix mille. Votre drone doit trancher, dans un périmètre qui couvre tout le parcours.`,
    `Votre mission est de compter le cortège à dix pour cent près, de mesurer sa longueur et de signaler deux points de compression. Votre estimation est transmise à la salle, qui la publie.`,
    `Volez à cent mètres. Comptez par blocs de cent personnes sur dix points de repère. Mesurez la longueur par les balises. Calculez la densité moyenne. Signalez les goulots. Annoncez : « Effectif estimé, dix mille. »`,
    `Votre comptage est public : il doit être honnête. Ne cédez pas à la pression de l'un ou l'autre camp. Une erreur supérieure à vingt-cinq pour cent est une faute.`,
  ],
  place: 'Boulevard Beaumarchais', timeOfDay: 15, weather: 'clair', windFrom: 270, windSpeed: 3,
  crowd: crowd(1500, 'pouvoir_achat', 0.2, 0.3, 0.02, { syndical: 0.4, familles: 0.2, retraites: 0.2, etudiants: 0.2 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard des Filles du Calvaire', 'Boulevard du Temple', 'Place de la République'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Dix mille personnes selon la préfecture, quinze mille selon les organisateurs.',
    'Aucun radical.', ['Boulevard Beaumarchais', 'Place de la République'],
    ['Compter par blocs de cent', 'Mesurer la longueur', 'Signaler les goulots']),
  phases: [
    ph('depart', 'Départ', 'Le cortège s\'ébranle de la Bastille.', T(240),
      [['ICARE', 'CENTRAL ICI ICARE. Tête de cortège en mouvement, calme. PARLEZ.']], []),
    ph('comptage', 'Comptage', 'Vous comptez par blocs.', T(480),
      [['ICARE', 'CENTRAL ICI ICARE. Premier comptage : TROIS MILLE à hauteur du boulevard des Filles-du-Calvaire. PARLEZ.']], ['Un goulot au carrefour']),
    ph('compression', 'Points de compression', 'Vous signalez deux goulots.', FOULE('dispersion'),
      [['ICARE', 'CENTRAL ICI ICARE. Compression à hauteur du boulevard du Temple. PARLEZ.']], []),
    ph('fin', 'Rapport', 'Vous remettez votre estimation.', FIN, [['ICARE', 'CENTRAL ICI ICARE. Effectif estimé, DIX MILLE, longueur UN-ZÉRO-ZÉRO-ZÉRO mètres. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Estimer l\'effectif à dix pour cent près', 'personnalise', { target: 'comptage', count: 10 }),
    ob('o2', 'Signaler deux points de compression', 'reperer_signaux', { count: 2 }),
    os('o3', 'Mesurer la longueur du cortège', 'personnalise', { target: 'longueur_cortege' }),
    os('o4', 'Ne pas voler à moins de cinquante mètres de la foule', 'personnalise', { target: 'distance_foule' }),
  ],
  failures: [fail('personnalise', 'Écart supérieur à vingt-cinq pour cent.', 25), fail('personnalise', 'Vol hors périmètre.')],
  randomEvents: ['Un goulot au carrefour', 'La batterie baisse vite', 'Un ballon masque la vue', 'Un drone privé gêne le vol'],
  unique: 'Le chiffre est un enjeu : compter honnêtement est une responsabilité.',
  tags: ['comptage', 'declaree'],
});

export const DRONE: MissionDef[] = [
  DRONE_01, DRONE_02, DRONE_03, DRONE_04, DRONE_05, DRONE_06, DRONE_07, DRONE_08, DRONE_09,
];
