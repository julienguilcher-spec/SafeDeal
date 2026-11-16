/* =====================================================================================
 * Catalogue — journaliste (photographe, reporter d'images, direct) : photographier, filmer, publier.
 * Rôle civil de la carrière : chaque mission s'ouvre quand sa mission miroir est terminée.
 * « PRESSE » est utilisé tel quel ; les rédactions et les médias cités sont fictifs.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_01, CDT_02, CDT_04 } from './commandant';
import { CRS_04, CRS_12 } from './crs';
import { EAU_02 } from './canon-eau';

const JR: Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> = { role: 'journaliste', rank: null, poste: null, profile: null };

export const JR_01 = mission({
  ...JR, type: 'formation', duration: 'courte', difficulty: 1, chapter: 13,
  id: 'journaliste-01-premier-cadrage',
  title: 'Premier cadrage',
  pitch: 'Premier atelier du photographe : régler l\'appareil, cadrer une scène calme et rapporter trois images de trois sujets différents.',
  briefing: [
    `Jardin des Tuileries, par un matin de brume. Un rédacteur en chef vous confie un appareil à téléobjectif pour un reportage d'apprentissage : un rassemblement calme de retraités. Vous avez votre brassard « PRESSE » et un casque.`,
    `Votre mission est de rapporter trois images de trois sujets différents : un portrait, une vue d'ensemble, un détail de pancarte. L'objectif est d'apprendre à cadrer et à choisir ce que l'on montre.`,
    `Réglez l'ouverture et la vitesse. Cadrez le portrait à l'œil, la vue d'ensemble depuis un point haut, le détail au téléobjectif. Demandez l'accord de la personne photographiée si elle est identifiable. Publiez les trois images dans le fil de la rédaction.`,
    `La presse peut circuler dans le dispositif et rester pendant une dispersion, tant qu'elle ne gêne pas et ne se confond pas avec les participants. En retour, elle doit montrer ce qui est : les deux camps. Ne mettez pas en scène. Ne coupez pas ce qui gêne.`,
  ],
  place: 'Jardin des Tuileries', timeOfDay: 10, weather: 'brouillard', windFrom: 270, windSpeed: 1,
  crowd: crowd(80, 'retraites', 0.05, 0.1, 0, { retraites: 0.6, familles: 0.2, curieux: 0.2 },
    ['Jardin des Tuileries'], 0.1),
  forces: forces({ sections: 0, pompiers: 0, samu: 0 }),
  intel: intel('Quatre-vingts retraités qui se retrouvent pour un rassemblement calme.', 'Aucun signalement.', ['Jardin des Tuileries'],
    ['Régler l\'appareil', 'Varier les plans', 'Respecter l\'accord des personnes']),
  phases: [
    ph('reglage', 'Réglages', 'Vous réglez l\'appareil et vérifiez le brassard.', T(45),
      [['RÉDACTION', 'Trois images de trois sujets différents.']], []),
    ph('prise', 'Prises de vue', 'Portrait, vue d\'ensemble, détail.', T(120),
      [['REPORTER', 'Première image envoyée.']], ['Un retraité demande à voir la photo']),
    ph('publication', 'Publication', 'Vous publiez les trois images.', FIN,
      [['RÉDACTION', 'Images reçues, bonne série.']], []),
  ],
  objectives: [
    ob('o1', 'Rapporter trois images de trois sujets différents', 'photographier', { count: 3 }),
    ob('o2', 'Publier la série dans le fil de la rédaction', 'publier', { count: 1 }),
    os('o3', 'Inclure une vue d\'ensemble', 'photographier', { target: 'vue_ensemble', count: 1 }),
  ],
  failures: [fail('personnalise', 'Moins de trois sujets rapportés.'), fail('temps', 'Atelier trop long.', 240)],
  randomEvents: ['Un retraité demande à voir la photo', 'La brume s\'épaissit'],
  unique: 'Un atelier sans enjeu où l\'on apprend la composition, premier outil du photographe.',
  tags: ['formation', 'photo'],
});

export const JR_02 = mission({
  ...JR, ...scene(CDT_01), difficulty: 2, chapter: 13, mirrorOf: CDT_01.id, altRoles: ['commandant'],
  id: 'journaliste-02-la-une',
  title: 'La une',
  pitch: 'De la République à la Bastille, rapporter cinq images de cinq sujets différents, dont une vue d\'ensemble et une image « deux camps ».',
  briefing: [
    `Un cortège déclaré du « Front commun des Ateliers » défile de la place de la République à la place de la Bastille. Neuf cents personnes, ambiance calme, mais la rédaction veut une une qui dise quelque chose. Vous êtes photographe pour un quotidien, « La Gazette du Marais ».`,
    `Votre mission est de rapporter cinq images de cinq sujets différents avant la clôture de l'édition du soir : une vue d'ensemble, un portrait, une pancarte lisible, un détail du service d'ordre et une image « deux camps » où l'on voit à la fois un manifestant et un policier.`,
    `Repérez un point haut pour la vue d'ensemble. Descendez dans le cortège pour les portraits. Allez à la tête pour les pancartes. À la Bastille, placez-vous au bord pour l'image « deux camps ». Publiez au fil de l'eau.`,
    `Vous pouvez franchir un cordon pour travailler : présentez-vous et montrez votre carte si on vous la demande. Ne dérangez personne. Une image sans contexte ne vaut rien : notez le lieu et l'heure.`,
  ],
  intel: intel(
    'Neuf cents marcheurs, ambiance calme ; le service d\'ordre syndical sera visible.',
    'Aucun signalement.', ['Place de la République', 'Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Repérer un point haut', 'Cadrer large puis serré', 'Noter le lieu et l\'heure']),
  phases: [
    ph('depart', 'Départ', 'Vous prenez vos premières images à la République.', T(240),
      [['RÉDACTION', 'Nous avons besoin de cinq sujets différents.']], []),
    ph('cortege', 'Dans le cortège', 'Vous descendez dans le cortège pour les portraits.', T(420),
      [['REPORTER', 'Deux images envoyées, portrait et pancarte.']], ['Une manifestante vous demande de ne pas la photographier']),
    ph('deux-camps', 'Image « deux camps »', 'Vous cadrez un manifestant et un policier.', FOULE('dispersion'),
      [['REPORTER', 'Image deux camps envoyée.']], []),
    ph('fin', 'Dernière publication', 'Vous publiez la série avant la clôture.', FIN, [['RÉDACTION', 'Série reçue.']], []),
  ],
  objectives: [
    ob('o1', 'Rapporter cinq images de cinq sujets différents', 'photographier', { count: 5 }),
    ob('o2', 'Inclure une vue d\'ensemble et une image « deux camps »', 'photographier', { target: 'deux_camps', count: 2 }),
    os('o3', 'Publier avant la clôture de l\'édition du soir', 'publier', { count: 1 }),
    os('o4', 'Respecter le refus d\'une personne qui ne veut pas être photographiée', 'personnalise', { target: 'refus_respecte', count: 1 }),
  ],
  failures: [fail('personnalise', 'Moins de trois sujets rapportés.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Une manifestante refuse d\'être photographiée', 'Averse de deux minutes', 'Un policier demande la carte de presse', 'L\'appareil perd sa batterie'],
  unique: 'La même marche que le commandant, vue à hauteur d\'objectif : on montre ce qu\'il ne voit pas.',
  tags: ['photo', 'miroir', 'declaree'],
});

export const JR_03 = mission({
  ...JR, ...scene(CDT_02), difficulty: 3, chapter: 13, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'journaliste-03-parapluies',
  title: 'Parapluies',
  pitch: 'Un précortège hostile aux caméras, des parapluies déployés pour masquer, et un reportage à rapporter malgré tout.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Un précortège de trois cents personnes en tête se forme à l'avant de la banderole officielle. Il est hostile aux caméras : visages masqués, parapluies déployés. Vous êtes reporter d'images, avec votre brassard « PRESSE » et un casque.`,
    `Votre mission est de rapporter des images du précortège sans vous faire arracher la caméra, de montrer ce qui se passe sans mettre en danger les personnes cadrées et de vous extraire quand la situation se dégrade.`,
    `Restez à l'extérieur du précortège. Utilisez le téléobjectif. Ne filmez pas les visages si vous ne devez pas. Placez-vous près d'un groupe de photographes. À l'ordre de repli, quittez la zone par la rue de Turbigo.`,
    `Les violents ne veulent pas être filmés : ne forcez pas. Ne gênez jamais l'action d'un secouriste. Un journaliste n'est pas un combattant : si un parapluie s'approche de votre objectif, reculez.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés, un précortège de trois cents personnes.',
    'Une centaine d\'individus qui refusent d\'être filmés.', ['Boulevard du Temple', 'Rue de Turbigo'],
    ['Rester à l\'extérieur du précortège', 'Utiliser le téléobjectif', 'Prévoir une sortie']),
  phases: [
    ph('rassemblement', 'Rassemblement', 'Le précortège se forme ; il vous repère.', T(240),
      [['RÉDACTION', 'Images du précortège demandées. Prudence.']], []),
    ph('hostilite', 'Hostilité', 'Un parapluie se tend vers votre objectif.', TENS(0.45),
      [['REPORTER', 'Hostilité des individus, parapluies devant l\'objectif.']], ['Un individu tente d\'arracher la caméra']),
    ph('affrontement', 'Affrontement', 'Le bloc attaque la ligne ; vous cadrez à distance.', FOULE('dispersion'),
      [['REPORTER', 'Jets sur les forces de l\'ordre, images envoyées.']], []),
    ph('fin', 'Repli', 'Vous vous extrayez par la rue de Turbigo.', FIN, [['RÉDACTION', 'Images reçues.']], []),
  ],
  objectives: [
    ob('o1', 'Rapporter trois images du précortège sans perdre la caméra', 'filmer', { count: 3 }),
    ob('o2', 'Rapporter une image de l\'affrontement', 'photographier', { target: 'affrontement', count: 1 }),
    os('o3', 'Ne pas être blessé', 'survivre'),
    os('o4', 'Publier la séquence', 'publier', { count: 1 }),
  ],
  failures: [fail('personnalise', 'Caméra détruite.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un individu tente d\'arracher la caméra', 'Retour de gaz', 'Un confrère est bousculé', 'Un fumigène éclate'],
  unique: 'Le journaliste que personne ne veut voir : filmer sans se faire casser.',
  tags: ['precortege', 'miroir'],
});

export const JR_04 = mission({
  ...JR, ...scene(CDT_04), difficulty: 4, chapter: 13, mirrorOf: CDT_04.id, altRoles: ['commandant'],
  id: 'journaliste-04-nuit-embarquee',
  title: 'Nuit embarquée',
  pitch: 'Reporter « embarqué » auprès d\'une compagnie, la nuit, dans le quartier du Palais-Royal : voir sans être de leur côté.',
  briefing: [
    `Rue Saint-Honoré, vingt-deux heures. Une cinquantaine de pilleurs attaquent des boutiques. Vous êtes reporter d'images embarqué avec une compagnie de CRS, pour une chaîne d'information en continu. Vous portez un casque et un brassard « PRESSE ».`,
    `Votre mission est de filmer la nuit en restant crédible : montrer l'action des policiers et les dégâts, sans prendre parti, et de n'être ni un obstacle pour les forces de l'ordre ni un complice. Vous devez aussi protéger vos sources.`,
    `Restez derrière la ligne, avec l'agent de liaison. Filmez les interpellations, les vitrines brisées, les feux. Interrogez les riverains. Gardez vos images pour la rédaction. Ne diffusez ni le visage d'un mineur ni celui d'un blessé.`,
    `Un embarqué est suspect pour ceux d'en face : restez à distance des affrontements. Ne portez jamais d'équipement de police. L'objectivité vaut mieux que le spectacle.`,
  ],
  intel: intel(
    'Cinq cents personnes ; une cinquantaine de pilleurs.',
    'Une quarantaine d\'individus encagoulés.', ['Rue Saint-Honoré', 'Place Vendôme', 'Rue de la Paix'],
    ['Rester derrière la ligne', 'Filmer les deux côtés', 'Ne pas porter d\'équipement de police']),
  phases: [
    ph('depart', 'Départ', 'Vous montez dans le fourgon.', T(240),
      [['RÉDACTION', 'Nuit embarquée, reportage d\'ambiance.']], []),
    ph('pillage', 'Pillage', 'Vous filmez les pilleurs.', TENS(0.65),
      [['REPORTER', 'Pillage en cours, images envoyées.']], ['Un pilleur vous repère']),
    ph('feux', 'Feux', 'Des feux sont allumés ; vous filmez les pompiers.', FOULE('dispersion'),
      [['REPORTER', 'Trois foyers actifs, pompiers en route.']], []),
    ph('fin', 'Fin de nuit', 'Vous rentrez avec la compagnie.', FIN, [['RÉDACTION', 'Reportage reçu.']], []),
  ],
  objectives: [
    ob('o1', 'Filmer une interpellation et une vitrine brisée', 'filmer', { count: 2 }),
    ob('o2', 'Rapporter les deux côtés de la scène', 'photographier', { target: 'deux_camps', count: 2 }),
    os('o3', 'Ne jamais gêner les forces de l\'ordre', 'personnalise', { target: 'gene_des_forces', max: 0 }),
    os('o4', 'Publier le reportage', 'publier', { count: 1 }),
  ],
  failures: [fail('joueur_hors_combat', 'Journaliste blessé.'), fail('personnalise', 'Caméra détruite.')],
  randomEvents: ['Un pilleur vous repère', 'Un policier vous demande de baisser la caméra', 'Une batterie de trottinette s\'embrase', 'Un confrère est agressé'],
  unique: 'L\'embarqué voit l\'envers du dispositif mais n\'en fait pas partie.',
  tags: ['nuit', 'embarque', 'miroir'],
});

export const JR_05 = mission({
  ...JR, ...scene(CRS_04), difficulty: 3, chapter: 13, mirrorOf: CRS_04.id, altRoles: ['crs'],
  id: 'journaliste-05-trente-secondes-d-antenne',
  title: 'Trente secondes d\'antenne',
  pitch: 'Sur la place de la Concorde, trois duplex de trente secondes aux heures imposées, la liaison stable et l\'action dans le cadre.',
  briefing: [
    `Place de la Concorde, un cortège interdit descend les Champs-Élysées vers le pont de la Concorde. La chaîne d'information « Canal Capitale » vous demande trois duplex en direct, à 16 h 00, 16 h 20 et 16 h 40, de trente secondes chacun. Vous êtes reporter avec un caméraman et une valise de liaison.`,
    `Votre mission est de réaliser les trois duplex à l'heure, avec une liaison stable, une image où la scène se voit derrière vous et un commentaire exact. L'action doit rester dans le cadre.`,
    `Choisissez un point d'où l'on voit le pont. Installez la valise à l'abri du vent. Annoncez : « Dans trente secondes, direct. » Parlez à la caméra. Ne vous placez pas devant un cordon de CRS. Gardez dix mètres avec la foule.`,
    `Un duplex manqué est une faute. Ne commentez jamais plus que ce que vous voyez. Un commentaire de parti pris ne passe pas l'antenne. Évitez les zones de gaz.`,
  ],
  intel: intel(
    'Deux mille personnes ; le pont de la Concorde est interdit.',
    'Une soixantaine d\'individus déterminés.', ['Place de la Concorde', 'Pont de la Concorde', 'Cours la Reine'],
    ['Installer la valise à l\'abri', 'Annoncer le direct', 'Rester à dix mètres de la foule']),
  phases: [
    ph('installation', 'Installation', 'Vous installez la liaison.', T(180),
      [['RÉGIE', 'Premier duplex à seize heures. Trente secondes, pas une de plus.']], []),
    ph('duplex-un', 'Premier duplex', 'Trente secondes d\'antenne devant le pont.', T(360),
      [['REPORTER', 'En direct, situation calme sur le pont.']], ['La liaison saute quelques secondes']),
    ph('duplex-deux', 'Deuxième duplex', 'La tension monte derrière vous.', TENS(0.5),
      [['REPORTER', 'Poussée sur le barrage, jets de projectiles.']], []),
    ph('fin', 'Troisième duplex', 'Le dernier duplex à seize heures quarante.', FIN, [['RÉGIE', 'Duplex terminés, bravo.']], []),
  ],
  objectives: [
    ob('o1', 'Réaliser trois duplex de trente secondes aux heures imposées', 'publier', { count: 3 }),
    ob('o2', 'Garder la liaison stable pendant chaque duplex', 'personnalise', { target: 'liaison_stable', count: 3 }),
    os('o3', 'Garder l\'action dans le cadre pendant les trois duplex', 'filmer', { target: 'pont', count: 3 }),
    os('o4', 'Ne rien affirmer à l\'antenne que vous n\'ayez vu vous-même', 'personnalise', { target: 'commentaire_non_verifie', max: 0 }),
  ],
  failures: [fail('personnalise', 'Duplex manqué.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['La liaison saute', 'Retour de gaz sur le plateau', 'Un manifestant interrompt le direct', 'Un confrère demande la place'],
  unique: 'Le direct ne se rejoue pas : trente secondes pour dire quelque chose de vrai.',
  tags: ['direct', 'miroir'],
});

export const JR_06 = mission({
  ...JR, type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'journaliste-06-logo-retire',
  title: 'Logo retiré',
  pitch: 'Reporter d\'images pris à partie par un groupe hostile : s\'extraire avec son agent de protection sans perdre la caméra.',
  briefing: [
    `Boulevard de Sébastopol, une manifestation vire à l'affrontement. Un groupe de manifestants reconnaît le logo de votre chaîne sur votre caméra et vous prend à partie. Votre caméraman est entouré, un agent de protection de la rédaction vous accompagne.`,
    `Votre mission est de vous extraire sans perdre la caméra, sans blesser personne et en préservant les images déjà tournées. Vous pouvez retirer le logo, mais la caméra est la source de la mission.`,
    `Retirez le logo. Cachez la caméra. Marchez à reculons vers un cordon de CRS. Demandez à l'agent de protection de vous couvrir. Ne criez pas. Ne vous défendez pas : vous n'êtes pas armé.`,
    `Les images valent plus que la caméra : sauvegardez-les si possible. Ne remettez jamais la carte mémoire à quiconque. Votre sécurité prime sur la prise de vue.`,
  ],
  place: 'Boulevard de Sébastopol', timeOfDay: 17, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.55, 0.7, 0.2, { black_bloc: 0.25, gilets_jaunes: 0.25, militants: 0.2, curieux: 0.3 },
    ['Boulevard de Sébastopol', 'Rue Réaumur'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un groupe hostile à la presse.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard de Sébastopol', 'Rue Réaumur'],
    ['Retirer le logo', 'Se replier vers un cordon', 'Sauvegarder les images']),
  phases: [
    ph('prise-a-partie', 'Prise à partie', 'Un groupe vous encercle.', T(60),
      [['REPORTER', 'Pris à partie, boulevard de Sébastopol.']], []),
    ph('extraction', 'Extraction', 'Vous reculez avec l\'agent de protection.', T(240),
      [['RÉDACTION', 'Repliez-vous sur le cordon.']], ['Un manifestant arrache le micro']),
    ph('cordon', 'Au cordon', 'Les CRS vous laissent passer.', TENS(0.65),
      [['CHEF DE SECTION', 'Passez le cordon, deux journalistes.']], []),
    ph('fin', 'Sauvegarde', 'Vous sauvegardez les images.', FIN, [['REPORTER', 'Images sauvegardées.']], []),
  ],
  objectives: [
    ob('o1', 'S\'extraire sans perdre la caméra', 'personnalise', { target: 'camera_perdue', max: 0 }),
    ob('o2', 'Sauvegarder les images déjà tournées', 'personnalise', { target: 'images_sauvegardees' }),
    os('o3', 'Retirer le logo avant de s\'éloigner', 'personnalise', { target: 'logo_retire' }),
    os('o4', 'Ne se défendre à aucun moment', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Caméra détruite.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un manifestant arrache le micro', 'Un confrère est bousculé', 'Un fumigène éclate', 'Un cordon de CRS se referme'],
  unique: 'Le logo, devenu cible : l\'enjeu est de rester un témoin sans devenir une victime.',
  tags: ['agression', 'presse'],
});

export const JR_07 = mission({
  ...JR, ...scene(EAU_02), difficulty: 3, chapter: 13, mirrorOf: EAU_02.id, altRoles: ['operateur_canon_eau'],
  id: 'journaliste-07-dispersion',
  title: 'Dispersion',
  pitch: 'Rester après les sommations, identifiable, et filmer la séquence complète : annonce, sommations, emploi de la force.',
  briefing: [
    `Place de la Bastille, fin de manifestation. Quatre cents personnes refusent de se disperser malgré les sommations. L'engin lanceur d'eau est prêt. Vous êtes reporter d'images de la chaîne « Canal Capitale ». Votre brassard « PRESSE » est visible.`,
    `Votre mission est de filmer la séquence complète : annonce, première sommation, dernière sommation, emploi de la force. Vous restez identifiable, à bonne distance, sans gêner l'action.`,
    `Placez-vous à l'angle de la rue de Lyon, à vingt mètres de la ligne. Filmez l'annonce, les sommations, puis le jet. Gardez l'horodatage. Ne vous placez pas devant la tourelle. Si les forces vous demandent de vous éloigner, négociez.`,
    `Rester après les sommations est un droit pour la presse, à condition de ne pas être confondu avec les manifestants. Un jet d'eau peut vous mouiller : protégez la caméra.`,
  ],
  intel: intel(
    'Quatre cents personnes ; une trentaine de lanceurs de bouteilles.',
    'Une trentaine d\'individus déterminés.', ['Place de la Bastille', 'Rue de Lyon'],
    ['Se placer à vingt mètres de la ligne', 'Filmer annonce, sommations, force', 'Protéger la caméra de l\'eau']),
  phases: [
    ph('sommations', 'Annonce et sommations', 'Le commandant prononce les sommations.', T(180),
      [['REPORTER', 'Annonce enregistrée à 19 h 02, horodatage conservé.']], []),
    ph('force', 'Emploi de la force', 'L\'engin lance l\'eau en pluie.', T(360),
      [['REPORTER', 'Jet d\'eau en pluie sur la première ligne.']], ['Un manifestant glisse devant vous']),
    ph('suite', 'Suite', 'Vous continuez à filmer la dispersion.', TENS(0.55),
      [['REPORTER', 'Séquence complète en cours.']], []),
    ph('fin', 'Publication', 'Vous publiez la séquence.', FIN, [['RÉDACTION', 'Séquence reçue.']], []),
  ],
  objectives: [
    ob('o1', 'Filmer la séquence complète annonce, sommations, force', 'filmer', { count: 4 }),
    ob('o2', 'Rester identifiable, brassard visible, à vingt mètres au moins de la ligne', 'personnalise', { target: 'distance_de_la_ligne', count: 20 }),
    os('o3', 'Publier la séquence avec l\'horodatage', 'publier', { count: 1 }),
    os('o4', 'Protéger la caméra de l\'eau', 'personnalise', { target: 'protection_camera' }),
  ],
  failures: [fail('personnalise', 'Séquence incomplète.'), fail('interpelle', 'Journaliste interpellé.')],
  randomEvents: ['Un jet d\'eau touche la caméra', 'Un policier demande d\'éloigner la presse', 'Un manifestant glisse', 'Un confrère filme sous un autre angle'],
  unique: 'Le témoin de la séquence légale : la sommation et son usage vus de dehors.',
  tags: ['dispersion', 'miroir'],
});

export const JR_08 = mission({
  ...JR, ...scene(CRS_12), difficulty: 4, chapter: 13, mirrorOf: CRS_12.id, altRoles: ['crs'],
  id: 'journaliste-08-la-preuve',
  title: 'La preuve',
  pitch: 'Une faute et une violence contre un policier à une minute d\'écart : filmer les deux, refuser de remettre la carte mémoire.',
  briefing: [
    `Rue de Rivoli, sous les arcades. Un cortège sauvage de quelques dizaines de personnes casse des vitrines. Vous êtes reporter d'images pour la chaîne « Canal Capitale ». En l'espace d'une minute, vous voyez deux scènes : un manifestant lance un projectile sur un policier, puis un policier frappe un manifestant à terre.`,
    `Votre mission est de filmer les deux scènes, de garder vos images intactes et de refuser, avec calme, de remettre votre carte mémoire à quiconque. Les deux scènes sont des preuves.`,
    `Placez-vous sous une arcade avec dégagement. Filmez la première scène, puis la seconde. Appuyez sur « enregistrer » avant que l'action ne commence. Si un agent exige la carte, répondez : « Je ne remets pas mes images, vous pouvez saisir la justice. »`,
    `Ne choisissez pas : montrez les deux. Une seule des deux scènes filmée est une faute professionnelle. Ne diffusez pas sans vérification.`,
  ],
  intel: intel(
    'Trois cents personnes en cortège sauvage, sous les arcades.',
    'Une soixantaine d\'individus encagoulés.', ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Placer la caméra avant l\'action', 'Filmer les deux scènes', 'Refuser la saisie de la carte']),
  phases: [
    ph('arcade', 'Sous l\'arcade', 'Vous trouvez un angle de vue.', T(120),
      [['RÉDACTION', 'Filmez sans choisir.']], []),
    ph('scene-un', 'Première scène', 'Un manifestant lance un projectile sur un policier.', T(300),
      [['REPORTER', 'Scène un filmée, jet de projectile sur agent.']], ['Un agent s\'approche de vous']),
    ph('scene-deux', 'Deuxième scène', 'Un policier frappe un manifestant à terre.', TENS(0.55),
      [['REPORTER', 'Scène deux filmée, geste d\'un agent sur une personne à terre.']], []),
    ph('fin', 'Saisie refusée', 'Un officier demande la carte mémoire.', FIN, [['REPORTER', 'Carte conservée.']], []),
  ],
  objectives: [
    ob('o1', 'Filmer les deux scènes', 'filmer', { count: 2 }),
    ob('o2', 'Conserver la carte mémoire', 'personnalise', { target: 'carte_memoire_conservee' }),
    os('o3', 'Ne pas gêner les forces de l\'ordre', 'personnalise', { target: 'gene_des_forces', max: 0 }),
    os('o4', 'Publier après vérification', 'publier', { count: 1 }),
  ],
  failures: [fail('personnalise', 'Une seule des deux scènes est filmée.'), fail('interpelle', 'Journaliste interpellé pour refus de remise.')],
  randomEvents: ['Un agent exige la carte', 'Un manifestant vous dénonce', 'Une batterie se vide', 'Un confrère filme sous un autre angle'],
  unique: 'Les deux scènes opposées : le journalisme n\'a pas de camp.',
  tags: ['preuve', 'miroir'],
});

export const JR_09 = mission({
  ...JR, type: 'emeute_nocturne', difficulty: 3, chapter: 13,
  id: 'journaliste-09-direct-de-vingt-heures',
  title: 'Direct de vingt heures',
  pitch: 'Le journal de vingt heures vous attend en direct devant l\'Hôtel de Ville : une émeute qui bouge, un commentaire à tenir.',
  briefing: [
    `Place de l'Hôtel de Ville, vingt heures. Une émeute éclate sur le parvis : barricades, feux, projectiles. Votre chaîne, « Canal Capitale », a besoin d'un direct pour le journal du soir. Vous êtes reporter avec un caméraman et une valise de liaison.`,
    `Votre mission est de tenir un direct de deux minutes, en commentant ce que vous voyez sans parti pris, sans vous mettre en danger et sans diffuser d'image qui expose une personne. Le direct commence à vingt heures pile.`,
    `Choisissez un point d'où l'on voit tout : le parvis, la façade de l'Hôtel de Ville, la rue de Rivoli. Annoncez : « Nous sommes en direct. » Décrivez ce que vous voyez : qui est là, combien, ce qu'ils font. Évitez les noms et les visages. Gardez la distance.`,
    `Un direct se rattrape mal : une erreur est entendue par des millions. Ne spéculez pas. Si une scène sort du cadre, coupez. Votre sécurité prime sur l'audience.`,
  ],
  place: 'Place de l\'Hôtel de Ville', timeOfDay: 20, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(500, '', 0.6, 0.75, 0.3, { black_bloc: 0.3, fetards: 0.2, curieux: 0.3, gilets_jaunes: 0.2 },
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'], 0.15),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Cinq cents personnes, barricades et feux.',
    'Une centaine d\'individus déterminés.', ['Place de l\'Hôtel de Ville', 'Rue de Rivoli'],
    ['Choisir un point de vue', 'Décrire sans parti pris', 'Éviter de montrer les visages']),
  phases: [
    ph('preparation', 'Préparation', 'Vous installez la liaison.', T(120),
      [['RÉGIE', 'Direct à vingt heures pile.']], []),
    ph('direct', 'Direct', 'Deux minutes d\'antenne sur l\'émeute.', T(300),
      [['REPORTER', 'En direct, barricades en feu sur le parvis.']], ['Un manifestant s\'invite dans le champ']),
    ph('escalade', 'Escalade', 'La situation se tend pendant le direct.', TENS(0.65),
      [['REPORTER', 'Jets de projectiles, je recule.']], []),
    ph('fin', 'Fin du direct', 'Vous rendez l\'antenne.', FIN, [['RÉGIE', 'Direct terminé, merci.']], []),
  ],
  objectives: [
    ob('o1', 'Tenir un direct de deux minutes sans erreur factuelle', 'filmer', { target: 'direct', count: 1, seconds: 120 }),
    ob('o2', 'Décrire nature, volume, attitude à chaque prise de parole', 'filmer', { count: 3 }),
    os('o3', 'Ne montrer à l\'antenne aucun visage identifiable de mineur ou de blessé', 'personnalise', { target: 'visage_identifiable', max: 0 }),
    os('o4', 'Reculer derrière le cordon dès que des projectiles tombent à moins de dix mètres', 'personnalise', { target: 'recul_a_temps', count: 1 }),
  ],
  failures: [fail('personnalise', 'Erreur factuelle diffusée.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un manifestant s\'invite dans le champ', 'La liaison saute', 'Un projectile tombe à proximité', 'Un confrère est touché'],
  unique: 'Le direct est un exercice de sang-froid : on parle pendant que le monde brûle derrière soi.',
  tags: ['direct', 'nuit'],
});

export const JR_10 = mission({
  ...JR, type: 'securisation', difficulty: 1, chapter: 13,
  id: 'journaliste-10-le-lendemain',
  title: 'Le lendemain',
  pitch: 'Le matin après la casse : photographier les dégâts, recueillir deux témoignages et rédiger un papier juste.',
  briefing: [
    `Boulevard de Magenta, neuf heures du matin. La veille, une manifestation a tourné à l'émeute : vitrines brisées, façades noircies, rideaux de fer arrachés. Les commerçants nettoient. Vous êtes reporter pour un quotidien, « La Gazette du Marais ».`,
    `Votre mission est de photographier les dégâts, de recueillir deux témoignages de commerçants et de rédiger un papier juste, sans emphase. Il n'y a pas de danger mais votre travail déterminera la façon dont la rue se souviendra.`,
    `Parcourez le boulevard. Photographiez les vitrines, les façades, les rideaux. Parlez à deux commerçants. Notez leurs noms et leurs mots. Vérifiez les faits auprès de la préfecture. Publiez.`,
    `Un papier qui exagère nuit à tout le monde. Ne demandez rien aux commerçants qu'ils ne veuillent pas dire. Respectez les gens qui nettoient : ils travaillent.`,
  ],
  place: 'Boulevard de Magenta', timeOfDay: 9, weather: 'couvert', windFrom: 250, windSpeed: 2, duration: 'courte',
  crowd: crowd(60, '', 0.05, 0.1, 0, { riverains: 0.6, curieux: 0.4 },
    ['Boulevard de Magenta'], 0.1),
  forces: forces({ sections: 0, pompiers: 0, samu: 0 }),
  intel: intel('Une soixantaine de commerçants et de riverains qui nettoient.', 'Aucun radical.', ['Boulevard de Magenta'],
    ['Photographier les dégâts', 'Interroger deux commerçants', 'Vérifier les faits']),
  phases: [
    ph('degats', 'Les dégâts', 'Vous photographiez les vitrines et les façades.', T(150),
      [['RÉDACTION', 'Nous attendons des images des dégâts.']], []),
    ph('temoignages', 'Témoignages', 'Vous recueillez deux témoignages.', T(270),
      [['REPORTER', 'Deux témoignages recueillis.']], ['Un commerçant refuse de parler']),
    ph('papier', 'Le papier', 'Vous rédigez et publiez.', FIN,
      [['RÉDACTION', 'Papier reçu.']], []),
  ],
  objectives: [
    ob('o1', 'Photographier au moins cinq dégâts différents', 'photographier', { count: 5 }),
    ob('o2', 'Recueillir deux témoignages de commerçants', 'filmer', { target: 'temoignage', count: 2 }),
    os('o3', 'Publier un papier sans emphase', 'publier', { count: 1 }),
    os('o4', 'Vérifier un fait auprès de la préfecture', 'personnalise', { target: 'verification' }),
  ],
  failures: [fail('personnalise', 'Moins de trois dégâts photographiés.'), fail('temps', 'Papier non rendu.', 600)],
  randomEvents: ['Un commerçant refuse de parler', 'Un riverain montre une vidéo', 'Une averse', 'Un confrère vous devance'],
  unique: 'Une mission sans danger : la prudence du journaliste se joue sur les mots.',
  tags: ['apres-coup', 'enquete'],
});

export const JOURNALISTE: MissionDef[] = [
  JR_01, JR_02, JR_03, JR_04, JR_05, JR_06, JR_07, JR_08, JR_09, JR_10,
];
