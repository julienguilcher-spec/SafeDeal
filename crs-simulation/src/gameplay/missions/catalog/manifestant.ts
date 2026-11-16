/* =====================================================================================
 * Catalogue — manifestant : pacifique (marcheur, famille, militant, service d'ordre) et radical
 * (bloc, meneur, opportuniste). Rôle civil de la carrière : ses missions s'ouvrent quand leur
 * mission miroir est terminée. Les organisations citées sont fictives ; les comportements sont
 * décrits au niveau du gameplay, sans mode d'emploi.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_01, CDT_02, CDT_04, CDT_06, CDT_11 } from './commandant';
import { CG_05 } from './chef-groupe';
import { BRAVM_02 } from './bravm';
import { EAU_02 } from './canon-eau';

const base = (profile: NonNullable<MissionSpec['profile']>): Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> =>
  ({ role: 'manifestant', rank: null, poste: null, profile });

export const MF_01 = mission({
  ...base('pacifique'), ...scene(CDT_01), difficulty: 1, chapter: 13, mirrorOf: CDT_01.id, altRoles: ['commandant'],
  id: 'manifestant-01-ma-premiere-manif',
  title: 'Ma première manif',
  pitch: 'Votre première marche : suivre le cortège de la République à la Bastille avec deux amis, reprendre les slogans et ne pas se perdre.',
  briefing: [
    `Samedi, quatorze heures, place de la République. Vous marchez pour la première fois avec le « Front commun des Ateliers », contre le « projet Horizon », une réforme fictive des horaires de travail. Vous êtes avec deux amis. Il y a du soleil, un camion sonorisé et de la bonne humeur.`,
    `Votre mission est de suivre le cortège jusqu'à la place de la Bastille avec vos deux amis, de reprendre au moins dix slogans, de rester dans le cortège et de ne pas être séparé de vos amis. Vous êtes un manifestant pacifique.`,
    `Prenez place derrière le camion sono. Chantez, lisez les pancartes, regardez autour de vous. Si un ami s'éloigne, attendez-le. Quand le cortège ralentit, restez groupé. À la Bastille, rejoignez le point de rendez-vous.`,
    `Ne cherchez pas le contact avec les forces de l'ordre : vous n'avez rien à faire de ce côté. Si vous voyez de la tension, éloignez-vous avec vos amis. Un téléphone chargé aide à se retrouver.`,
  ],
  intel: intel(
    'Neuf cents marcheurs, ambiance syndicale ; des policiers discrets.',
    'Aucun signalement.', ['Place de la République', 'Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Rester avec ses amis', 'Charger son téléphone', 'Choisir un point de rendez-vous']),
  phases: [
    ph('depart', 'Départ', 'Vous retrouvez vos amis et prenez place.', T(240),
      [['AMI', 'JOUEUR ICI AMI. Je suis derrière le camion, tu me rejoins ? PARLEZ.']], []),
    ph('marche', 'En marche', 'Le cortège descend le boulevard en chantant.', T(480),
      [['AMI', 'JOUEUR ICI AMI. On reprend le slogan « Horizon, c\'est non ! ». PARLEZ.']], ['Un ami s\'arrête pour acheter une boisson']),
    ph('ralentissement', 'Ralentissement', 'Le cortège s\'arrête près du boulevard du Temple.', FOULE('dispersion'),
      [['AMI', 'JOUEUR ICI AMI. On reste ensemble, ça pousse un peu. PARLEZ.']], []),
    ph('fin', 'Arrivée à la Bastille', 'Vous rejoignez le point de rendez-vous.', FIN, [['AMI', 'JOUEUR ICI AMI. Ça y est, on est arrivés. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Arriver place de la Bastille avec ses deux amis', 'rester_dans_cortege', { place: 'Place de la Bastille', count: 2 }),
    ob('o2', 'Reprendre dix slogans', 'personnalise', { target: 'slogan', count: 10 }),
    os('o3', 'Ne jamais s\'éloigner de plus de vingt mètres de ses amis', 'proteger_les_siens', { target: 'amis' }),
    os('o4', 'Ne pas être au contact des forces de l\'ordre', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Groupe dispersé.'), fail('joueur_hors_combat', 'Malaise ou blessure.')],
  randomEvents: ['Un ami s\'arrête pour acheter une boisson', 'Averse de deux minutes', 'Un touriste demande son chemin', 'Un vendeur de ballons passe'],
  unique: 'La même marche que le commandant, vue de l\'intérieur : on découvre ce que la ligne voit à peine.',
  tags: ['pacifique', 'miroir', 'debutant'],
});

export const MF_02 = mission({
  ...base('pacifique'), type: 'manifestation_declaree', difficulty: 2, chapter: 13,
  id: 'manifestant-02-jusqu-au-bout',
  title: 'Jusqu\'au bout',
  pitch: 'Arriver au bout du parcours avec cinq amis, sans blessé, en ayant repris dix slogans et traversé un moment de tension.',
  briefing: [
    `Boulevard Beaumarchais, un après-midi couvert. Vous marchez avec cinq amis au sein d'un cortège de mille deux cents personnes, contre une taxe fictive sur l'énergie, avec le « Collectif Lumière Pour Tous ». À l'avant, un groupe encagoulé tire le cortège vers l'affrontement.`,
    `Votre mission est de rester groupé avec vos cinq amis jusqu'à l'arrivée, de reprendre dix slogans et de ne pas laisser un seul d'entre eux se blesser. Vous êtes manifestant pacifique : vous protégez le groupe plus que vous ne lancez des idées.`,
    `Restez au milieu du cortège, à distance de la tête. Si des jets de projectiles commencent, reculez calmement. Prenez la main d'un ami qui s'affole. Cherchez une sortie latérale. Gardez un point de rendez-vous.`,
    `Un cortège pacifique peut être pris dans une tension qu'il n'a pas voulue : la clé est de ne pas paniquer. Ne tentez pas de séparer les violents des autres : ce n'est pas votre rôle.`,
  ],
  place: 'Boulevard Beaumarchais', timeOfDay: 16, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(1200, 'pouvoir_achat', 0.3, 0.5, 0.06, { syndical: 0.3, familles: 0.2, retraites: 0.15, gilets_jaunes: 0.2, etudiants: 0.15 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard du Temple'], 0.45),
  forces: forces({ sections: 3, fourgons: 8, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille deux cents marcheurs ; ambiance sérieuse, quelques groupes en tête.',
    'Une trentaine d\'individus encagoulés en tête.', ['Boulevard Beaumarchais', 'Boulevard du Temple'],
    ['Rester au milieu du cortège', 'Garder un point de rendez-vous', 'Éviter la tête']),
  phases: [
    ph('depart', 'Départ', 'Vous prenez place avec vos amis.', T(240),
      [['AMI', 'JOUEUR ICI AMI. On est cinq, on reste groupés. PARLEZ.']], []),
    ph('marche', 'En marche', 'Le cortège avance ; la tête s\'agite.', T(420),
      [['AMI', 'JOUEUR ICI AMI. Là-bas, des gens se couvrent le visage. PARLEZ.']], ['Un ami veut aller voir devant']),
    ph('tension', 'Tension', 'Des projectiles volent à l\'avant ; le cortège ralentit.', TENS(0.45),
      [['AMI', 'JOUEUR ICI AMI. On recule, on prend la rue latérale. PARLEZ.']], []),
    ph('fin', 'Arrivée', 'Vous rejoignez le point de rendez-vous.', FIN, [['AMI', 'JOUEUR ICI AMI. Tout le monde est là. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Arriver avec ses cinq amis', 'rester_dans_cortege', { count: 5 }),
    ob('o2', 'Ne laisser personne de son groupe blessé', 'proteger_les_siens', { target: 'amis', max: 0 }),
    os('o3', 'Reprendre dix slogans', 'personnalise', { target: 'slogan', count: 10 }),
    os('o4', 'Éviter la tête du cortège', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Groupe dispersé.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Un ami veut aller voir devant', 'Une panique soudaine', 'Retour de gaz', 'Un vieil homme ralentit le groupe'],
  unique: 'Un groupe d\'amis à protéger : on s\'aperçoit qu\'on est responsable de gens qu\'on aime.',
  tags: ['pacifique', 'amis'],
});

export const MF_03 = mission({
  ...base('militant'), type: 'manifestation_declaree', difficulty: 2, chapter: 13,
  id: 'manifestant-03-la-banderole',
  title: 'La banderole',
  pitch: 'Porter à deux une banderole de six mètres, tendue pendant tout le parcours, virages compris.',
  briefing: [
    `Boulevard Saint-Germain, un cortège d'étudiants de la « Coordination Étudiante Rive Gauche », contre la réforme « Parcours+ ». Vous êtes militant. Votre mission est de porter la banderole de tête avec une camarade, six mètres de tissu peint, par un vent d'ouest soutenu.`,
    `Votre mission est de tenir la banderole tendue pendant tout le parcours, virages compris, sans la laisser tomber plus de vingt secondes et sans la déchirer. Elle est le symbole de la tête de cortège.`,
    `Avancez au pas, à trois mètres de votre camarade. Tendez le tissu. Dans les virages, coordonnez-vous : le côté extérieur accélère. Si le vent se lève, serrez les poings. Si un chien traverse, laissez-le passer.`,
    `Une banderole qui tombe devient un obstacle pour ceux qui marchent derrière. Un ami qui chante vous distrait : gardez le rythme. Ne laissez jamais la banderole toucher le sol.`,
  ],
  place: 'Boulevard Saint-Germain', timeOfDay: 15, weather: 'nuageux', windFrom: 270, windSpeed: 6,
  crowd: crowd(800, 'education', 0.15, 0.25, 0.02, { etudiants: 0.5, lyceens: 0.2, syndical: 0.15, curieux: 0.15 },
    ['Place Saint-Michel', 'Boulevard Saint-Germain', 'Rue de Rennes'], 0.5),
  forces: forces({ sections: 2, fourgons: 5, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents étudiants, vent soutenu ; ambiance festive et sérieuse.',
    'Aucun signalement.', ['Boulevard Saint-Germain', 'Rue de Rennes'],
    ['Coordonner les virages', 'Serrer les poings dans le vent', 'Garder le rythme']),
  phases: [
    ph('depart', 'Départ', 'Vous prenez la banderole avec votre camarade.', T(180),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. On tend, on avance. PARLEZ.']], []),
    ph('droite', 'Ligne droite', 'La banderole flotte sous le vent.', T(360),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Tiens bon, ça claque. PARLEZ.']], ['Une rafale arrache le coin du tissu']),
    ph('virage', 'Virage', 'Le cortège tourne dans la rue de Rennes.', T(540),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Virage dans DIX secondes. PARLEZ.']], []),
    ph('fin', 'Arrivée', 'Vous posez la banderole.', FIN, [['CAMARADE', 'JOUEUR ICI CAMARADE. On l\'a fait. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Garder la banderole tendue pendant tout le parcours', 'rester_dans_cortege', { seconds: 900 }),
    ob('o2', 'Ne jamais la laisser tomber plus de vingt secondes', 'personnalise', { target: 'banderole', seconds: 20 }),
    os('o3', 'Passer les virages sans déchirer le tissu', 'personnalise', { target: 'virage', count: 2 }),
    os('o4', 'Garder le rythme avec sa camarade', 'proteger_les_siens', { target: 'camarade' }),
  ],
  failures: [fail('personnalise', 'Banderole lâchée plus de vingt secondes.', 20), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Une rafale arrache le coin du tissu', 'Un chien traverse', 'Un photographe se place devant', 'La camarade trébuche'],
  unique: 'Un acte tout simple, porter ensemble : la coordination devient la mission.',
  tags: ['pacifique', 'banderole'],
});

export const MF_04 = mission({
  ...base('pacifique'), ...scene(CG_05), difficulty: 3, chapter: 13, mirrorOf: CG_05.id, altRoles: ['chef_groupe'],
  id: 'manifestant-04-assis',
  title: 'Assis',
  pitch: 'Sit-in devant l\'Assemblée nationale : rester assis pendant les sommations ou partir à temps, en comprenant le risque.',
  briefing: [
    `Place du Palais Bourbon, quatorze heures. Vous participez à un sit-in avec cent cinquante autres militants, devant l'Assemblée nationale, pour protester contre une loi fictive sur les libertés. Vous êtes assis, bras liés. Les CRS arrivent en ligne.`,
    `Votre mission est de décider de rester ou de partir, en comprenant que le délit se constitue après la dernière sommation. Vous pouvez rester assis, partir ou vous faire porter. Chaque choix a une conséquence sur votre situation.`,
    `Écoutez les sommations : « Obéissance à la loi. Vous devez vous disperser et quitter les lieux. » Pesez. Si vous restez, restez calme, ne résistez pas physiquement. Si vous partez, partez par la rue de l'Université. Ne filmez pas pendant l'évacuation.`,
    `Rester après la dernière sommation vous expose à une interpellation. Un geste de résistance active aggrave la situation. Votre avocat est joignable par téléphone : mémorisez son numéro.`,
  ],
  intel: intel(
    'Cent cinquante militants assis, bras liés.',
    'Aucun radical.', ['Place du Palais Bourbon', 'Rue de l\'Université'],
    ['Mémoriser le numéro de son avocat', 'Ne pas résister physiquement', 'Choisir avant la dernière sommation']),
  phases: [
    ph('sit-in', 'Sit-in', 'Vous vous installez, assis, bras liés.', T(180),
      [['MILITANT', 'JOUEUR ICI MILITANT. On reste assis, on chante. PARLEZ.']], []),
    ph('sommations', 'Sommations', 'Le commandant prononce l\'annonce puis les sommations.', T(360),
      [['COMMANDANT', 'ATTROUPEMENT ICI COMMANDANT. Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux. TERMINÉ.']], ['Un voisin se lève pour partir']),
    ph('decision', 'Décision', 'Vous restez ou vous partez.', TENS(0.5),
      [['COMMANDANT', 'ATTROUPEMENT ICI COMMANDANT. Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux. TERMINÉ.']], []),
    ph('fin', 'Évacuation', 'Les CRS évacuent ceux qui restent.', FIN, [['MILITANT', 'JOUEUR ICI MILITANT. On est portés un par un. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Rester assis jusqu\'à la dernière sommation ou partir à temps', 'ne_pas_etre_interpelle', { place: 'Place du Palais Bourbon' }),
    ob('o2', 'Ne résister physiquement à aucun moment', 'proteger_les_siens', { target: 'sans_violence' }),
    os('o3', 'Mémoriser le numéro d\'un avocat', 'personnalise', { target: 'avocat' }),
    os('o4', 'Aider une personne âgée à partir', 'proteger_les_siens', { target: 'personne_agee' }),
  ],
  failures: [fail('interpelle', 'Interpellé sans l\'avoir choisi.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Un voisin se lève pour partir', 'Un journaliste filme de près', 'Un policier s\'adresse à vous', 'Un malaise dans le groupe'],
  unique: 'La résistance passive vue de l\'intérieur : le choix se fait en une phrase.',
  tags: ['sit-in', 'miroir'],
});

export const MF_05 = mission({
  ...base('pacifique'), ...scene(EAU_02), difficulty: 2, chapter: 13, mirrorOf: EAU_02.id, altRoles: ['operateur_canon_eau'],
  id: 'manifestant-05-temoin',
  title: 'Témoin',
  pitch: 'Filmer une interpellation à distance de sécurité, sans gêner, et publier la vidéo.',
  briefing: [
    `Place de la Bastille, fin de manifestation. Vous êtes manifestant pacifique, téléphone à la main. À trente mètres, des policiers interpellent un homme. Un engin lanceur d'eau est en retrait. Vous décidez de filmer pour témoigner.`,
    `Votre mission est de filmer l'interpellation à plus de cinq mètres, sans gêner l'action, de capter la séquence complète et de la publier. Le téléphone est votre arme : il ne doit pas être perdu.`,
    `Placez-vous contre un mur. Filmez en paysage. Annoncez l'heure et le lieu à voix basse. Ne criez pas, n'insultez pas. Si un policier vous demande de reculer, reculez. À la fin, sauvegardez et publiez.`,
    `Filmer est un droit, gêner est une faute. Un policier peut vous demander de vous éloigner : obéissez en gardant votre téléphone. Ne vous mettez pas entre l'interpellé et les agents.`,
  ],
  intel: intel(
    'Quatre cents personnes ; une interpellation à trente mètres.',
    'Une trentaine d\'individus lanceurs de bouteilles.', ['Place de la Bastille', 'Rue de Lyon'],
    ['Rester à plus de cinq mètres', 'Filmer en paysage', 'Sauvegarder aussitôt']),
  phases: [
    ph('sommations', 'Sommations', 'Les sommations sont prononcées.', T(180),
      [['COMMANDANT', 'PLACE ICI COMMANDANT. Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux. TERMINÉ.']], []),
    ph('interpellation', 'Interpellation', 'Une interpellation a lieu devant vous.', T(360),
      [['JOUEUR', 'TÉMOIN ICI JOUEUR. Interpellation en cours, je filme. PARLEZ.']], ['Un policier vous demande de reculer']),
    ph('suite', 'Suite', 'Vous continuez à filmer.', TENS(0.5),
      [['JOUEUR', 'TÉMOIN ICI JOUEUR. Séquence en cours, aucune violence apparente. PARLEZ.']], []),
    ph('fin', 'Publication', 'Vous publiez la vidéo.', FIN, [['JOUEUR', 'TÉMOIN ICI JOUEUR. Vidéo publiée. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Filmer l\'interpellation à plus de cinq mètres', 'filmer', { target: 'interpellation', count: 1 }),
    ob('o2', 'Publier la vidéo', 'publier', { count: 1 }),
    os('o3', 'Ne pas gêner l\'action des agents', 'ne_pas_etre_interpelle'),
    os('o4', 'Garder son téléphone', 'survivre'),
  ],
  failures: [fail('personnalise', 'Téléphone perdu ou confisqué.'), fail('interpelle', 'Interpellé pour entrave.')],
  randomEvents: ['Un policier demande de reculer', 'Un jet d\'eau mouille le téléphone', 'Un autre témoin filme sous un autre angle', 'Un manifestant crie'],
  unique: 'Le témoin : on apprend que la caméra est une protection pour tous.',
  tags: ['temoin', 'miroir'],
});

export const MF_06 = mission({
  ...base('famille'), ...scene(CDT_06), difficulty: 4, chapter: 13, mirrorOf: CDT_06.id, altRoles: ['commandant'],
  id: 'manifestant-06-la-nasse',
  title: 'La nasse',
  pitch: 'Pris dans un encerclement avec une poussette : trouver la sortie contrôlée, garder son calme.',
  briefing: [
    `Rue de Turbigo, en fin d'après-midi. Vous êtes venu avec votre compagne et votre enfant en poussette pour soutenir les soignants des « Blouses Claires ». La police boucle soudain l'îlot : plusieurs rues sont fermées. Des groupes violents se mêlent à la foule. Vous voulez sortir.`,
    `Votre mission est de trouver la sortie contrôlée, de protéger votre enfant et votre compagne, de garder votre calme et d'obtenir le passage dès que possible. Vous êtes père de famille, pas militant.`,
    `Écoutez les annonces. Repérez la sortie rue Rambuteau. Demandez à un agent : « Je suis avec un enfant, laissez-moi passer. » Évitez les groupes violents. Tenez la poussette à deux mains. Ne criez pas.`,
    `La panique est le danger principal. Ne vous éloignez pas de votre compagne. Un agent peut vous demander de vous identifier : montrez votre pièce d'identité calmement.`,
  ],
  intel: intel(
    'Cent quatre-vingts personnes retenues, dont des familles.',
    'Soixante individus déterminés dans l\'îlot.', ['Rue de Turbigo', 'Rue Rambuteau'],
    ['Repérer la sortie', 'Demander le passage', 'Garder son calme']),
  phases: [
    ph('bouclage', 'Bouclage', 'La police ferme les rues autour de vous.', T(180),
      [['COMMANDANT', 'ÎLOT ICI COMMANDANT. Sortie contrôlée rue Rambuteau, annonce toutes les minutes. TERMINÉ.']], []),
    ph('attente', 'Attente', 'Vous attendez votre tour.', T(420),
      [['COMPAGNE', 'JOUEUR ICI COMPAGNE. Il pleure, on sort quand ? PARLEZ.']], ['Un groupe violent passe près de vous']),
    ph('sortie', 'Sortie', 'Vous atteignez le contrôle.', TENS(0.6),
      [['AGENT', 'JOUEUR ICI AGENT. Passez, avancez avec la poussette. TERMINÉ.']], []),
    ph('fin', 'Dehors', 'Vous êtes sortis.', FIN, [['COMPAGNE', 'JOUEUR ICI COMPAGNE. On est dehors. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Sortir de l\'îlot avec sa compagne et son enfant', 'proteger_les_siens', { target: 'famille', count: 2 }),
    ob('o2', 'Garder son calme pendant toute l\'attente', 'survivre'),
    os('o3', 'Éviter les groupes violents', 'ne_pas_etre_interpelle'),
    os('o4', 'Sortir en moins de vingt minutes', 'duree', { seconds: 1200 }),
  ],
  failures: [fail('personnalise', 'Panique : l\'enfant est blessé.'), fail('interpelle', 'Interpellé par erreur.')],
  randomEvents: ['Un groupe violent passe près de vous', 'L\'enfant pleure', 'Une grenade tombe à proximité', 'Un agent demande votre pièce d\'identité'],
  unique: 'La nasse vue d\'en bas : un père, un enfant, et la patience pour seule arme.',
  tags: ['famille', 'nasse', 'miroir'],
});

export const MF_07 = mission({
  ...base('service_ordre'), type: 'manifestation_declaree', difficulty: 3, chapter: 13,
  id: 'manifestant-07-le-virage',
  title: 'Le virage',
  pitch: 'Tenir la chaîne du service d\'ordre pendant que huit mille personnes tournent, et empêcher les voitures d\'entrer dans le cortège.',
  briefing: [
    `Boulevard Richard-Lenoir, un cortège de huit mille personnes va tourner en direction de la place de la Bastille. Vous êtes du service d'ordre du « Front commun des Ateliers » : brassard, talkie, chaîne humaine de dix personnes. Votre mission est de protéger le virage.`,
    `Votre mission est de tenir la chaîne pendant que le cortège tourne, d'empêcher les voitures d'entrer dans le cortège et de signaler tout incident à votre responsable. Vous ne lancez jamais rien, vous canalisez.`,
    `Prenez place à l'angle. Tenez la chaîne bras liés. Parlez aux automobilistes : « Désolé, pouvez-vous attendre trois minutes ? » Avertissez le responsable si un groupe tente de forcer. Gardez le talkie.`,
    `Vous n'êtes pas un policier : vous ne touchez personne. Si un automobiliste est agressif, appelez la police. Ne répondez pas aux provocations.`,
  ],
  place: 'Boulevard Richard-Lenoir', timeOfDay: 15.5, weather: 'clair', windFrom: 260, windSpeed: 3,
  crowd: crowd(1500, 'pouvoir_achat', 0.3, 0.4, 0.04, { syndical: 0.45, familles: 0.15, retraites: 0.15, etudiants: 0.15, gilets_jaunes: 0.1 },
    ['Boulevard Richard-Lenoir', 'Place de la Bastille'], 0.45),
  forces: forces({ sections: 2, fourgons: 5, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit mille marcheurs déclarés ; le virage est un point sensible.',
    'Une trentaine de personnes déterminées en tête.', ['Boulevard Richard-Lenoir', 'Place de la Bastille'],
    ['Tenir la chaîne', 'Parler aux automobilistes', 'Signaler tout incident']),
  phases: [
    ph('installation', 'Mise en place', 'Vous prenez place dans la chaîne.', T(180),
      [['RESPONSABLE', 'SO ICI RESPONSABLE. Chaîne en place à l\'angle. PARLEZ.']], []),
    ph('virage', 'Le virage', 'Le cortège tourne ; la poussée est forte.', T(420),
      [['RESPONSABLE', 'SO ICI RESPONSABLE. Tenez la chaîne, ça pousse. PARLEZ.']], ['Une voiture approche']),
    ph('automobiliste', 'Automobiliste', 'Un automobiliste klaxonne et avance.', TENS(0.4),
      [['JOUEUR', 'RESPONSABLE ICI JOUEUR. Voiture à l\'angle, je parle au conducteur. PARLEZ.']], []),
    ph('fin', 'Fin du virage', 'Le dernier char passe.', FIN, [['RESPONSABLE', 'SO ICI RESPONSABLE. Virage terminé. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Tenir la chaîne pendant tout le virage', 'proteger_les_siens', { target: 'chaine', seconds: 600 }),
    ob('o2', 'Empêcher toute voiture d\'entrer dans le cortège', 'proteger_les_siens', { target: 'cortege' }),
    os('o3', 'Ne porter aucun coup', 'ne_pas_etre_interpelle'),
    os('o4', 'Signaler l\'incident à votre responsable', 'personnalise', { target: 'signalement', count: 1 }),
  ],
  failures: [fail('personnalise', 'Chaîne rompue.'), fail('personnalise', 'Voiture dans le cortège.')],
  randomEvents: ['Une voiture approche', 'Un groupe force la chaîne', 'Un ami arrive en retard', 'Le talkie tombe en panne'],
  unique: 'La chaîne humaine : une mission où l\'on protège les siens sans jamais frapper.',
  tags: ['service-ordre', 'chaine'],
});

export const MF_08 = mission({
  ...base('service_ordre'), type: 'manifestation_declaree', difficulty: 3, chapter: 13,
  id: 'manifestant-08-le-carre',
  title: 'Le carré',
  pitch: 'Protéger le carré de tête d\'une poussée du précortège, sans porter un seul coup.',
  briefing: [
    `Boulevard Voltaire, un cortège syndical de six mille personnes avance vers la place de la Nation. Au centre du carré de tête, les responsables du « Front commun des Ateliers ». Le précortège pousse pour passer devant. Vous êtes du service d'ordre : brassard, chaîne.`,
    `Votre mission est de protéger le carré de tête d'une poussée du précortège, de maintenir la distance de dix mètres et de calmer les esprits sans violence. Vous êtes un rempart sans arme.`,
    `Placez-vous sur le flanc du carré. Prenez les bras de vos voisins. Parlez au précortège : « Laissez passer les responsables. » Si un individu insiste, appelez un renfort. Si un coup part, retirez-vous et prévenez.`,
    `Votre ennemi n'est pas le bloc, c'est l'escalade. Ne touchez à personne. Vous ne pouvez pas empêcher les violents de s'avancer : vous pouvez seulement protéger le carré.`,
  ],
  place: 'Boulevard Voltaire', timeOfDay: 14.5, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(1200, 'retraites', 0.35, 0.5, 0.08, { syndical: 0.5, retraites: 0.2, black_bloc: 0.08, familles: 0.1, etudiants: 0.12 },
    ['Place de la République', 'Boulevard Voltaire'], 0.5),
  forces: forces({ sections: 2, fourgons: 5, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six mille marcheurs ; un précortège de trois cents en avant.',
    'Une centaine d\'individus encagoulés.', ['Boulevard Voltaire'],
    ['Tenir le flanc du carré', 'Parler au précortège', 'Appeler un renfort']),
  phases: [
    ph('depart', 'Départ', 'Le carré se forme.', T(180),
      [['RESPONSABLE', 'SO ICI RESPONSABLE. Carré en place, chaîne sur les flancs. PARLEZ.']], []),
    ph('poussee', 'Poussée', 'Le précortège pousse sur le carré.', TENS(0.5),
      [['RESPONSABLE', 'SO ICI RESPONSABLE. Poussée sur le flanc nord, tenez. PARLEZ.']], ['Un individu insiste']),
    ph('desescalade', 'Désescalade', 'Vous calmez le précortège.', FOULE('dispersion'),
      [['JOUEUR', 'RESPONSABLE ICI JOUEUR. Individus calmés, carré préservé. PARLEZ.']], []),
    ph('fin', 'Arrivée', 'Le carré arrive à la Nation.', FIN, [['RESPONSABLE', 'SO ICI RESPONSABLE. Carré intact. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Protéger le carré de tête jusqu\'à l\'arrivée', 'proteger_les_siens', { target: 'carre', seconds: 900 }),
    ob('o2', 'Ne porter aucun coup', 'ne_pas_etre_interpelle'),
    os('o3', 'Convaincre trois individus de rester derrière', 'personnalise', { target: 'persuasion', count: 3 }),
    os('o4', 'Prévenir le responsable à chaque incident', 'personnalise', { target: 'signalement', count: 2 }),
  ],
  failures: [fail('personnalise', 'Carré envahi.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Un individu insiste', 'Un fumigène est jeté', 'Un militant s\'effondre', 'Un journaliste se glisse dans le carré'],
  unique: 'Protéger sans frapper : la parole est l\'arme du service d\'ordre.',
  tags: ['service-ordre', 'carre'],
});

export const MF_09 = mission({
  ...base('service_ordre'), type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'manifestant-09-desamorcer',
  title: 'Désamorcer',
  pitch: 'Trois militants veulent rejoindre la casse : les retenir par la parole.',
  briefing: [
    `Rue de Rivoli, à la fin d'un cortège syndical. Trois jeunes militants de votre organisation, excités par des images vues en ligne, veulent rejoindre un groupe qui casse des vitrines à deux cents mètres. Vous êtes responsable du service d'ordre local.`,
    `Votre mission est de les retenir par la parole : écouter leurs griefs, leur proposer une alternative, les persuader de ne pas partir. Vous ne pouvez pas les empêcher physiquement. Votre seule arme est la confiance.`,
    `Prenez-les à part. Écoutez sans interrompre. Dites : « Je comprends votre colère. » Proposez de rester ensemble, de filmer plutôt que de casser. Rappelez les conséquences d'une interpellation. Gardez-les près de vous.`,
    `Un militant qui part vous échappe pour toujours. Ne mentez pas : les promesses non tenues détruisent la confiance. Si l'un d'eux part, ne le suivez pas.`,
  ],
  place: 'Rue de Rivoli', timeOfDay: 17.5, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(500, 'pouvoir_achat', 0.4, 0.55, 0.1, { syndical: 0.4, etudiants: 0.2, black_bloc: 0.1, curieux: 0.3 },
    ['Rue de Rivoli', 'Rue de Castiglione'], 0.3),
  forces: forces({ sections: 2, fourgons: 4, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un groupe casse à deux cents mètres.',
    'Une cinquantaine d\'individus encagoulés.', ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Prendre les trois militants à part', 'Écouter avant de parler', 'Proposer une alternative']),
  phases: [
    ph('contact', 'Contact', 'Vous repérez les trois militants.', T(120),
      [['RESPONSABLE', 'SO ICI RESPONSABLE. Trois des nôtres s\'éloignent vers Rivoli. PARLEZ.']], []),
    ph('discussion', 'Discussion', 'Vous parlez aux trois militants.', T(300),
      [['JOUEUR', 'RESPONSABLE ICI JOUEUR. Je les ai pris à part. PARLEZ.']], ['L\'un d\'eux hausse le ton']),
    ph('decision', 'Décision', 'Les militants hésitent.', TENS(0.5),
      [['JOUEUR', 'RESPONSABLE ICI JOUEUR. Deux restent, un hésite. PARLEZ.']], []),
    ph('fin', 'Fin', 'La casse est terminée.', FIN, [['RESPONSABLE', 'SO ICI RESPONSABLE. Retour au calme. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Retenir au moins deux des trois militants', 'proteger_les_siens', { target: 'militants', count: 2 }),
    ob('o2', 'Les persuader sans élever la voix', 'personnalise', { target: 'persuasion' }),
    os('o3', 'Ne pas mentir à un militant', 'ne_pas_etre_interpelle'),
    os('o4', 'Éviter qu\'ils se fassent interpeller', 'proteger_les_siens', { target: 'interpellation_evitee' }),
  ],
  failures: [fail('personnalise', 'Deux militants sont partis.'), fail('interpelle', 'Un militant est interpellé.')],
  randomEvents: ['L\'un d\'eux hausse le ton', 'Un message en ligne les excite', 'Un policier passe à proximité', 'Un ami arrive en renfort'],
  unique: 'Désamorcer : la mission la plus difficile consiste à convaincre les siens.',
  tags: ['service-ordre', 'dialogue'],
});

export const MF_10 = mission({
  ...base('meneur'), ...scene(CDT_02), difficulty: 4, chapter: 13, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'manifestant-10-le-signal',
  title: 'Le signal',
  pitch: 'En tête du précortège, vous donnez le signal : quelques minutes pour agir puis se fondre dans la foule avant l\'arrivée des forces de l\'ordre.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Vous faites partie d'un petit groupe déterminé, en tête du cortège. Vous êtes noir de la tête aux pieds, avec un sac à dos. Un chef vous a désigné pour donner le signal du changement de comportement.`,
    `Votre mission est de rester dans le groupe, de donner le signal aux autres au bon moment, d'agir pendant quelques dizaines de secondes puis de vous replier et de vous fondre dans la foule avant l'arrivée des CRS. Vous jouez un rôle de meneur radical, dont les conséquences sont montrées.`,
    `Rassemblez-vous avec le groupe. Vérifiez vos protections. Au signal, avancez ensemble. Après trente à quatre-vingt-dix secondes, repliez-vous par les rues latérales. Changez de tenue à couvert. Rejoignez le cortège principal.`,
    `Le drone vous suit : chaque mouvement est observé. Une interpellation vous exposera à des poursuites. Ne vous séparez jamais du groupe pendant le repli. Le prix de chaque geste vous sera montré à la fin.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés ; un précortège de trois cents personnes.',
    'Une centaine d\'individus déterminés dont vous faites partie.', ['Boulevard du Temple', 'Rue de Turbigo'],
    ['Rester groupé', 'Se replier avant les CRS', 'Se changer à couvert']),
  phases: [
    ph('formation', 'Formation du bloc', 'Le groupe se forme en tête du cortège.', T(240),
      [['CHEF', 'BLOC ICI CHEF. On se regroupe, parapluies ouverts. PARLEZ.']], []),
    ph('signal', 'Le signal', 'Vous donnez le signal ; le groupe avance.', TENS(0.5),
      [['CHEF', 'BLOC ICI CHEF. Signal ! On y va ensemble. PARLEZ.']], ['Les CRS sortent en ligne']),
    ph('repli', 'Repli', 'Le groupe se replie par les rues latérales.', FOULE('dispersion'),
      [['CHEF', 'BLOC ICI CHEF. Repli par la rue de Turbigo, on se change. PARLEZ.']], []),
    ph('fin', 'Fondu dans la foule', 'Vous vous mêlez au cortège principal.', FIN, [['CHEF', 'BLOC ICI CHEF. Dispersion, chacun rentre. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Donner le signal au bon moment', 'personnalise', { target: 'signal', count: 1 }),
    ob('o2', 'Se replier et se changer avant l\'arrivée des CRS', 'ne_pas_etre_interpelle'),
    os('o3', 'Rester avec le groupe pendant tout le repli', 'proteger_les_siens', { target: 'groupe' }),
    os('o4', 'Ne pas être repéré par le drone', 'ne_pas_etre_interpelle', { target: 'drone' }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Les CRS sortent en ligne', 'Un camarade est interpellé', 'Un drone passe au-dessus', 'Un journaliste vous suit'],
  unique: 'Vous passez de l\'autre côté de la ligne : comprendre l\'avant-garde radicale, avec ses conséquences.',
  tags: ['radical', 'bloc', 'miroir'],
});

export const MF_11 = mission({
  ...base('radical'), ...scene(CDT_04), difficulty: 4, chapter: 13, mirrorOf: CDT_04.id, altRoles: ['commandant'],
  id: 'manifestant-11-la-barricade',
  title: 'La barricade',
  pitch: 'Dresser un obstacle avec le mobilier disponible avant l\'arrivée de la ligne, sans mettre un riverain en danger.',
  briefing: [
    `Rue Saint-Honoré, nuit tombante. Vous êtes avec un petit groupe qui veut ralentir l'avancée des CRS. Le mobilier de la rue offre ce qu'il faut : poubelles, barrières, vélos en libre-service, palettes. La ligne arrive dans quatre minutes.`,
    `Votre mission est de dresser un obstacle en travers de la rue avec le mobilier disponible, avant l'arrivée de la ligne, sans mettre de riverain en danger. Il faut aussi éviter qu'un feu ne gagne une façade. Vous mesurerez les conséquences à la fin.`,
    `Rassemblez le mobilier. Placez les barrières en travers, puis les poubelles. Évitez de placer l'obstacle contre une façade. Si vous mettez le feu, gardez dix mètres de distance avec les immeubles. Prévenez les riverains aux fenêtres.`,
    `Un feu de barricade peut gagner un immeuble habité : c'est la limite. Les batteries de vélos électriques s'embrasent violemment : gardez vos distances. Une fois la ligne arrivée, repliez-vous.`,
  ],
  intel: intel(
    'Cinq cents personnes ; la ligne arrive dans quatre minutes.',
    'Une quarantaine d\'individus encagoulés.', ['Rue Saint-Honoré', 'Place Vendôme'],
    ['Rassembler le mobilier', 'Éviter les façades', 'Se replier à l\'arrivée de la ligne']),
  phases: [
    ph('materiel', 'Rassembler le mobilier', 'Vous réunissez poubelles, barrières, vélos.', T(120),
      [['CHEF', 'GROUPE ICI CHEF. On barre la rue, vite. PARLEZ.']], []),
    ph('construction', 'Construction', 'Vous dressez l\'obstacle.', T(300),
      [['CHEF', 'GROUPE ICI CHEF. Les CRS arrivent dans DEUX minutes. PARLEZ.']], ['Un riverain crie depuis sa fenêtre']),
    ph('feu', 'Le feu', 'La barricade est enflammée ; la ligne approche.', TENS(0.6),
      [['CHEF', 'GROUPE ICI CHEF. On recule, ils arrivent. PARLEZ.']], []),
    ph('fin', 'Repli', 'Le groupe se disperse.', FIN, [['CHEF', 'GROUPE ICI CHEF. Dispersion, chacun rentre. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Dresser l\'obstacle avant l\'arrivée de la ligne', 'personnalise', { target: 'barricade', count: 1 }),
    ob('o2', 'Ne mettre aucun riverain en danger', 'proteger_les_siens', { target: 'riverain' }),
    os('o3', 'Éviter que le feu gagne une façade', 'ne_pas_etre_interpelle', { target: 'facade' }),
    os('o4', 'Se replier avant d\'être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Feu gagnant une façade habitée.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un riverain crie depuis sa fenêtre', 'Une batterie de trottinette s\'embrase', 'Un pompier arrive', 'Le drone vous suit'],
  unique: 'La barricade vue de l\'intérieur : on mesure la responsabilité d\'un feu en pleine ville.',
  tags: ['radical', 'barricade', 'miroir', 'nuit'],
});

export const MF_12 = mission({
  ...base('radical'), ...scene(BRAVM_02), difficulty: 3, chapter: 13, mirrorOf: BRAVM_02.id, altRoles: ['bravm', 'telepilote'],
  id: 'manifestant-12-chat-et-souris',
  title: 'Chat et souris',
  pitch: 'Un cortège sauvage de quatre-vingts personnes poursuivi par des motos : atteindre trois cibles sans se faire prendre.',
  briefing: [
    `Boulevard Montmartre, la nuit. Vous êtes avec un groupe mobile d'une quatre-vingtaine de personnes, tenue sombre, sac à dos. Le groupe remonte les Grands Boulevards. Des motos de police suivent à distance et un drone vole au-dessus.`,
    `Votre mission est d'atteindre trois cibles désignées par le groupe (deux banques, une bijouterie) sans vous faire interpeller, en échappant aux motos et au drone. Vous êtes un manifestant radical dans un cortège sauvage.`,
    `Restez au centre du groupe. Changez de rue quand les motos s'approchent. Utilisez les passages couverts. Évitez les rues larges. Changez de vêtements à l'abri. Dispersez-vous à l'ordre du chef.`,
    `Les motos peuvent descendre vite et interpeller : ne restez jamais en queue de groupe. Le drone voit les couleurs : changez de veste. Ne mettez pas en danger les passants.`,
  ],
  intel: intel(
    'Quatre-vingts personnes en groupe mobile ; trois cibles.',
    'Soixante individus encagoulés.', ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'],
    ['Rester au centre du groupe', 'Changer de rue', 'Changer de tenue']),
  phases: [
    ph('depart', 'Départ', 'Le groupe remonte les boulevards.', T(180),
      [['CHEF', 'GROUPE ICI CHEF. On remonte, première cible dans DEUX minutes. PARLEZ.']], []),
    ph('poursuite', 'Poursuite', 'Les motos s\'approchent.', TENS(0.55),
      [['CHEF', 'GROUPE ICI CHEF. Motos derrière, on tourne à gauche. PARLEZ.']], ['Un camarade est interpellé']),
    ph('dispersion', 'Dispersion', 'Le groupe se divise.', FOULE('dispersion'),
      [['CHEF', 'GROUPE ICI CHEF. On se disperse, chacun par une rue. PARLEZ.']], []),
    ph('fin', 'Retour', 'Vous rentrez chez vous.', FIN, [['CHEF', 'GROUPE ICI CHEF. Fin de la nuit. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Atteindre deux des trois cibles', 'atteindre', { target: 'cible', count: 2 }),
    ob('o2', 'Échapper aux motos et au drone', 'ne_pas_etre_interpelle'),
    os('o3', 'Changer de tenue avant la dispersion', 'personnalise', { target: 'changement_tenue' }),
    os('o4', 'Ne pas mettre un passant en danger', 'proteger_les_siens', { target: 'passant' }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Un camarade est interpellé', 'Une moto surgit d\'une rue latérale', 'Un passant se plante devant le groupe', 'Un drone passe au-dessus'],
  unique: 'Le chat et la souris : la ville devient un jeu d\'évitement, de la nuit tombante à l\'aube.',
  tags: ['radical', 'cortege-sauvage', 'miroir', 'nuit'],
});

export const MF_13 = mission({
  ...base('radical'), ...scene(CDT_11), difficulty: 3, chapter: 13, mirrorOf: CDT_11.id, altRoles: ['commandant', 'secouriste'],
  id: 'manifestant-13-le-palet',
  title: 'Le palet',
  pitch: 'Renvoyer ou éloigner des palets fumants pour dégager un groupe pris dans le gaz.',
  briefing: [
    `Place de la République, à l'heure des sommations. Vous êtes avec un groupe de trente personnes au pied de la statue. Des grenades lacrymogènes tombent près de vous. Votre groupe est pris dans le nuage, avec des enfants et des personnes âgées en périphérie.`,
    `Votre mission est d'éloigner les palets fumants du groupe ou de les renvoyer vers la ligne, de dégager les personnes les plus exposées et d'éviter de vous brûler. Vous êtes radical : vous acceptez le contact, mais pas la blessure.`,
    `Mettez des gants épais. Saisissez le palet avec un geste rapide. Éloignez-le vers l'extérieur. Aidez les enfants à sortir. Respirez par un foulard humide. Reculez du nuage.`,
    `Un palet brûlant peut brûler la main : ne le portez pas plus de deux secondes. Le renvoi vers la ligne peut aggraver la situation et vous exposer à des poursuites. Vous en mesurerez la conséquence.`,
  ],
  intel: intel(
    'Quatre cents personnes ; nuage lacrymogène sur la place.',
    'Trente individus déterminés près de la statue.', ['Place de la République', 'Boulevard du Temple'],
    ['Mettre des gants épais', 'Éloigner plutôt que renvoyer', 'Aider les personnes exposées']),
  phases: [
    ph('gaz', 'Le nuage', 'Les grenades tombent près du groupe.', T(120),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. On est pris dans le gaz, faut dégager ! PARLEZ.']], []),
    ph('palets', 'Les palets', 'Vous saisissez les palets fumants.', T(300),
      [['JOUEUR', 'CAMARADE ICI JOUEUR. J\'en éloigne DEUX, aide-moi. PARLEZ.']], ['Un palet brûle les gants']),
    ph('degagement', 'Dégagement', 'Le groupe se dégage du nuage.', TENS(0.55),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Les enfants sont sortis. PARLEZ.']], []),
    ph('fin', 'Fin', 'Le nuage se dissipe.', FIN, [['CAMARADE', 'JOUEUR ICI CAMARADE. Tout le monde est sorti. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Éloigner au moins trois palets du groupe', 'proteger_les_siens', { target: 'palet', count: 3 }),
    ob('o2', 'Dégager les personnes exposées', 'proteger_les_siens', { target: 'personne_exposee', count: 5 }),
    os('o3', 'Ne pas se brûler les mains', 'survivre'),
    os('o4', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('joueur_hors_combat', 'Brûlure grave ou malaise.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un palet brûle les gants', 'Retour de gaz', 'Un enfant tousse', 'Un journaliste filme de près'],
  unique: 'Renvoyer ou éloigner : la mission raconte la physique des gaz, de l\'autre côté du nuage.',
  tags: ['radical', 'gaz', 'miroir'],
});

export const MF_14 = mission({
  ...base('radical'), type: 'manifestation_interdite', difficulty: 3, chapter: 13,
  id: 'manifestant-14-disparaitre',
  title: 'Disparaître',
  pitch: 'Après une action, sortir du périmètre sans être désigné par le drone.',
  briefing: [
    `Boulevard Poissonnière, une manifestation interdite se disperse. Vous venez de participer à une action collective qui a causé des dégâts. Vous êtes en tenue sombre, capuche, sac à dos. Un drone de la préfecture vole au-dessus de la zone.`,
    `Votre mission est de sortir du périmètre sans être désigné par le drone, de ne pas être interpellé, de vous changer à couvert et de rejoindre le métro. La clé est de ne pas courir : la course attire.`,
    `Marchez. Changez de veste dans un porche. Retirez la capuche. Mêlez-vous à un groupe de passants. Évitez les rues larges. Prenez le métro à une station éloignée.`,
    `Le drone voit les couleurs : changer de veste est essentiel. Ne regardez pas en l'air. Ne vous retournez pas. Si un policier vous interpelle, restez calme et demandez un avocat.`,
  ],
  place: 'Boulevard Poissonnière', timeOfDay: 18, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.45, 0.55, 0.15, { gilets_jaunes: 0.25, black_bloc: 0.15, militants: 0.2, curieux: 0.4 },
    ['Boulevard Poissonnière', 'Boulevard de Bonne Nouvelle', 'Rue du Faubourg Poissonnière'], 0.5),
  forces: forces({ sections: 2, fourgons: 4, drone: true, bravm: 2, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes en dispersion ; un drone survole la zone.',
    'Une soixantaine d\'individus ont participé à l\'action.', ['Boulevard Poissonnière', 'Boulevard de Bonne Nouvelle'],
    ['Marcher sans courir', 'Changer de veste à couvert', 'Prendre le métro loin']),
  phases: [
    ph('apres-action', 'Après l\'action', 'Vous quittez le lieu à pas rapides.', T(120),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Marche, ne cours pas. PARLEZ.']], []),
    ph('changement', 'Changement de tenue', 'Vous vous changez dans un porche.', T(300),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Veste retournée, capuche baissée. PARLEZ.']], ['Un drone passe au-dessus']),
    ph('metro', 'Vers le métro', 'Vous rejoignez la station.', TENS(0.5),
      [['CAMARADE', 'JOUEUR ICI CAMARADE. Station Grands Boulevards, on y va. PARLEZ.']], []),
    ph('fin', 'Disparition', 'Vous vous fondez dans la foule du métro.', FIN, [['CAMARADE', 'JOUEUR ICI CAMARADE. On est passés. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Sortir du périmètre sans être désigné par le drone', 'ne_pas_etre_interpelle', { target: 'drone' }),
    ob('o2', 'Atteindre la station de métro', 'atteindre', { place: 'Grands Boulevards' }),
    os('o3', 'Se changer à couvert', 'personnalise', { target: 'changement_tenue' }),
    os('o4', 'Ne jamais courir', 'survivre'),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('personnalise', 'Désigné par le drone.')],
  randomEvents: ['Un drone passe au-dessus', 'Une patrouille de la BRAV-M apparaît', 'Un policier demande vos papiers', 'La station est fermée'],
  unique: 'La disparition : la ville est un labyrinthe dans lequel la seule règle est d\'avoir l\'air ordinaire.',
  tags: ['radical', 'fuite'],
});

export const MF_15 = mission({
  ...base('radical'), type: 'emeute_nocturne', difficulty: 4, chapter: 13,
  id: 'manifestant-15-ligne-rouge',
  title: 'Ligne rouge',
  pitch: 'Votre groupe veut s\'en prendre aux pompiers : refuser, s\'interposer ou partir.',
  briefing: [
    `Rue Saint-Antoine, la nuit. Votre groupe a allumé plusieurs feux. Un fourgon de sapeurs-pompiers de Paris arrive pour éteindre. Quelques individus, hors de contrôle, veulent s'en prendre à lui : lancer des projectiles et bloquer la lance.`,
    `Votre mission est de choisir : refuser, vous interposer ou partir. Une ligne rouge est franchie si les secours sont agressés. Vous êtes radical, mais pas prêt à tout.`,
    `Parlez au chef : « Pas les pompiers. » Placez-vous entre le fourgon et les individus. Faites reculer. Si le groupe insiste, partez. Aidez les pompiers à passer s'ils le demandent.`,
    `Les pompiers n'ont pas d'armes : ce sont des secours. S'en prendre à eux est impardonnable : l'image du groupe et la vôtre en dépendent. Les conséquences judiciaires sont lourdes.`,
  ],
  place: 'Rue Saint-Antoine', timeOfDay: 23, weather: 'clair', windFrom: 240, windSpeed: 2,
  crowd: crowd(250, '', 0.65, 0.8, 0.4, { black_bloc: 0.4, fetards: 0.3, curieux: 0.3 },
    ['Rue Saint-Antoine', 'Place de la Bastille'], 0.1),
  forces: forces({ sections: 1, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux cent cinquante personnes ; plusieurs feux allumés.',
    'Une centaine d\'individus encagoulés.', ['Rue Saint-Antoine', 'Place de la Bastille'],
    ['Protéger les pompiers', 'S\'interposer ou partir', 'Convaincre le chef']),
  phases: [
    ph('arrivee', 'Arrivée des pompiers', 'Le fourgon approche ; le groupe s\'agite.', T(120),
      [['CHEF', 'GROUPE ICI CHEF. Les pompiers arrivent, on les bloque. PARLEZ.']], []),
    ph('decision', 'Votre décision', 'Vous refusez, vous interposez ou vous partez.', T(300),
      [['JOUEUR', 'CHEF ICI JOUEUR. Pas les pompiers, on ne touche pas. PARLEZ.']], ['Un individu lance une bouteille vers le fourgon']),
    ph('suite', 'Suite', 'Les pompiers éteignent ; le groupe se divise.', TENS(0.6),
      [['SANTÉ 1', 'JOUEUR ICI SANTÉ UN. Merci, nous passons. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les feux sont éteints.', FIN, [['SANTÉ 1', 'JOUEUR ICI SANTÉ UN. Feux éteints. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Empêcher toute agression contre les pompiers', 'proteger_les_siens', { target: 'pompiers' }),
    ob('o2', 'Choisir : refuser, s\'interposer ou partir', 'personnalise', { target: 'choix_ligne_rouge' }),
    os('o3', 'Convaincre le chef du groupe', 'personnalise', { target: 'persuasion' }),
    os('o4', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Secours agressés.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un individu lance une bouteille vers le fourgon', 'Le chef vous insulte', 'Un pompier est touché', 'Un policier approche'],
  unique: 'La ligne rouge : on découvre que la violence a des limites, et que c\'est à chacun de les fixer.',
  tags: ['radical', 'ligne-rouge', 'nuit'],
});

export const MF_16 = mission({
  ...base('radical'), type: 'emeute_nocturne', difficulty: 3, chapter: 13,
  id: 'manifestant-16-le-prix',
  title: 'Le prix',
  pitch: 'Jouer une séquence d\'affrontement, puis découvrir l\'écran des suites judiciaires : toutes les fins sont montrées.',
  briefing: [
    `Place du Châtelet, en fin d'après-midi. Vous participez à un affrontement avec des CRS : jets de projectiles, repli, retour. Vous êtes un manifestant radical. Cette mission est pédagogique : elle vous fait jouer l'affrontement puis découvrir ses suites, quelle que soit votre fin.`,
    `Votre mission est de jouer la séquence : participer à l'affrontement, vous replier ou être interpellé. Quoi que vous fassiez, un écran vous montre ensuite les suites : garde à vue, jugement, casier, conséquences pour les proches.`,
    `Avancez avec le groupe. Jetez ce que vous voulez, dans les limites du jeu. Repliez-vous à l'ordre. Si vous êtes interpellé, vous êtes mis en garde à vue. Lisez ensuite l'écran des suites.`,
    `Tous les chemins mènent à un écran de conséquences : amende, condamnation, mention au casier, perte d'emploi. C'est le prix. La mission ne juge pas : elle montre.`,
  ],
  place: 'Place du Châtelet', timeOfDay: 18, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.6, 0.7, 0.3, { black_bloc: 0.3, gilets_jaunes: 0.25, militants: 0.2, curieux: 0.25 },
    ['Place du Châtelet', 'Boulevard de Sébastopol'], 0.4),
  forces: forces({ sections: 3, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; un affrontement prévisible.',
    'Cent vingt individus déterminés.', ['Place du Châtelet', 'Boulevard de Sébastopol'],
    ['Suivre le groupe', 'Se replier à l\'ordre', 'Lire l\'écran des suites']),
  phases: [
    ph('depart', 'Départ', 'Le groupe se forme à la place.', T(180),
      [['CHEF', 'GROUPE ICI CHEF. On y va ensemble, on garde le rythme. PARLEZ.']], []),
    ph('affrontement', 'Affrontement', 'Jets de projectiles et repli.', TENS(0.6),
      [['CHEF', 'GROUPE ICI CHEF. Repli ! On se dégage par le quai. PARLEZ.']], ['Un camarade tombe à terre']),
    ph('suites', 'Suites', 'Vous découvrez les suites de vos choix.', FOULE('dispersion'),
      [['AVOCAT', 'JOUEUR ICI AVOCAT. Vos choix ont des conséquences, regardons-les. PARLEZ.']], []),
    ph('fin', 'Écran des suites', 'Garde à vue, jugement, casier : toutes les fins sont montrées.', FIN, [['AVOCAT', 'JOUEUR ICI AVOCAT. Fin de séquence. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Participer à la séquence d\'affrontement jusqu\'au repli', 'survivre', { seconds: 300 }),
    ob('o2', 'Lire l\'écran des suites judiciaires', 'personnalise', { target: 'ecran_suites' }),
    os('o3', 'Ne pas blesser un tiers', 'proteger_les_siens', { target: 'tiers' }),
    os('o4', 'Se replier à l\'ordre', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('temps', 'Séquence abandonnée avant la fin : l\'écran des suites est montré quand même.', 900)],
  randomEvents: ['Un camarade tombe à terre', 'Un drone passe au-dessus', 'Retour de gaz', 'Un journaliste filme de près'],
  unique: 'La seule mission où il n\'y a pas d\'échec : toutes les fins mènent à l\'écran des conséquences.',
  tags: ['radical', 'pedagogique', 'suites-judiciaires'],
});

export const MF_17 = mission({
  ...base('opportuniste'), type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'manifestant-17-demi-tour',
  title: 'Demi-tour',
  pitch: 'Dans un cortège qui bascule, vous pouvez suivre les autres ou faire demi-tour : le moment où l\'on choisit.',
  briefing: [
    `Boulevard Saint-Martin, un cortège déclaré se disloque. Vous êtes opportuniste : venu par curiosité, vous suivez un groupe qui s'enhardit. Des vitrines brisées, des cris, des projectiles. Le moment de la bascule est là.`,
    `Votre mission est de choisir : suivre le groupe ou faire demi-tour. Vous pouvez rester spectateur, participer ou vous éloigner. Chaque choix a ses conséquences et ses scènes.`,
    `Regardez autour de vous. Écoutez ce que vous ressentez. Décidez en trente secondes. Si vous suivez, vous participez à une dégradation. Si vous faites demi-tour, rejoignez la sortie. Si vous restez, vous risquez d'être pris dans une nasse.`,
    `Un demi-tour n'est pas une lâcheté : c'est une décision. Une fois au contact, difficile de revenir. Le jeu ne vous jugera pas, il vous montrera.`,
  ],
  place: 'Boulevard Saint-Martin', timeOfDay: 17, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(600, 'libertes', 0.5, 0.65, 0.12, { gilets_jaunes: 0.25, black_bloc: 0.12, syndical: 0.2, curieux: 0.43 },
    ['Boulevard Saint-Martin', 'Place de la République'], 0.45),
  forces: forces({ sections: 2, fourgons: 5, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six cents personnes ; un cortège qui se disloque.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard Saint-Martin', 'Place de la République'],
    ['Choisir en trente secondes', 'Repérer la sortie', 'Éviter la nasse']),
  phases: [
    ph('curiosite', 'Curiosité', 'Vous suivez le cortège par curiosité.', T(180),
      [['AMI', 'JOUEUR ICI AMI. Viens, on va voir ce qui se passe devant. PARLEZ.']], []),
    ph('bascule', 'Bascule', 'Le groupe se durcit autour de vous.', TENS(0.5),
      [['AMI', 'JOUEUR ICI AMI. Ça part en vrille, on suit ou on part ? PARLEZ.']], ['Une vitrine est brisée devant vous']),
    ph('choix', 'Votre choix', 'Vous suivez, vous restez ou vous partez.', FOULE('dispersion'),
      [['AMI', 'JOUEUR ICI AMI. Décide-toi, vite. PARLEZ.']], []),
    ph('fin', 'Suites', 'Vous mesurez les conséquences de votre décision.', FIN, [['AMI', 'JOUEUR ICI AMI. Voilà ce que ça donne. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Prendre une décision avant l\'arrivée des CRS', 'personnalise', { target: 'decision', seconds: 30 }),
    ob('o2', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
    os('o3', 'Rejoindre la sortie par la rue latérale', 'atteindre', { place: 'Boulevard Saint-Martin' }),
    os('o4', 'Retrouver son ami', 'proteger_les_siens', { target: 'ami' }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Joueur blessé.')],
  randomEvents: ['Une vitrine est brisée devant vous', 'Un ami veut suivre le groupe', 'Les CRS arrivent', 'Une grenade tombe près de vous'],
  unique: 'Le moment du choix : l\'opportuniste découvre que rester ou partir est la vraie mission.',
  tags: ['opportuniste', 'bascule'],
});

export const MANIFESTANT: MissionDef[] = [
  MF_01, MF_02, MF_03, MF_04, MF_05, MF_06, MF_07, MF_08, MF_09,
  MF_10, MF_11, MF_12, MF_13, MF_14, MF_15, MF_16, MF_17,
];
