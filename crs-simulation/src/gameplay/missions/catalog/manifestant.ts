/* =====================================================================================
 * Catalogue — manifestant : pacifique (marcheur, famille, militant, service d'ordre) et radical
 * (bloc, meneur, opportuniste). Rôle civil de la carrière : ses missions s'ouvrent quand leur
 * mission miroir est terminée. Les organisations citées sont fictives ; les comportements sont
 * décrits au niveau du gameplay, sans mode d'emploi.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, scene, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_01, CDT_06 } from './commandant';
import { CG_05 } from './chef-groupe';
import { EAU_02 } from './canon-eau';
import { MF_10, MF_11, MF_12, MF_13, MF_14, MF_15, MF_16, MF_17 } from './manifestant-radical';

const base = (profile: NonNullable<MissionSpec['profile']>): Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> =>
  ({ role: 'manifestant', rank: null, poste: null, profile });

export const MF_01 = mission({
  ...base('pacifique'), ...scene(CDT_01), difficulty: 1, chapter: 13, mirrorOf: CDT_01.id, altRoles: ['commandant'],
  id: 'manifestant-01-ma-premiere-manif',
  title: 'Ma première manif',
  pitch: 'Votre première marche : suivre le cortège de la République à la Bastille avec deux amis, reprendre les slogans et ne pas se perdre.',
  briefing: [
    `Samedi, quatorze heures, place de la République. Vous marchez pour la première fois avec le « Front commun des Ateliers », contre le « projet Horizon », une réforme des horaires de travail. Vous êtes avec deux amis. Il y a du soleil, un camion sonorisé et de la bonne humeur.`,
    `Votre mission est de suivre le cortège jusqu'à la place de la Bastille avec vos deux amis, de reprendre au moins dix slogans, de rester dans le cortège et de ne pas être séparé de vos amis. Vous êtes un manifestant pacifique.`,
    `Prenez place derrière le camion sono. Chantez, lisez les pancartes, regardez autour de vous. Si un ami s'éloigne, attendez-le. Quand le cortège ralentit, restez groupé. À la Bastille, rejoignez le point de rendez-vous.`,
    `Ne cherchez pas le contact avec les forces de l'ordre : vous n'avez rien à faire de ce côté. Si vous voyez de la tension, éloignez-vous avec vos amis. Un téléphone chargé aide à se retrouver.`,
  ],
  intel: intel(
    'Neuf cents marcheurs, ambiance syndicale ; des policiers discrets.',
    'Aucun signalement.', ['Place de la République', 'Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Rester avec ses amis', 'Charger son téléphone', 'Choisir un point de rendez-vous']),
  phases: [
    ph('rendez-vous', `Le rendez-vous sous la statue`,
      `Samedi, quatorze heures, place de la République. Vos deux amis vous attendent quelque part au pied de la statue, parmi neuf cents personnes, des ballons turquoise et l'odeur des merguez. C'est votre première manifestation : le plus difficile, pour l'instant, est de retrouver quelqu'un dans une foule où tout le monde lève son téléphone.`,
      FOULE('depart'), [
        voix('AMIE', `On est côté métro, sous le lampadaire avec l'autocollant ! Lève le bras, je ne te vois pas !`),
        voix('MÉGAPHONE', `On se met en place derrière la banderole ! Départ dans cinq minutes, direction Bastille !`),
      ], [`Un vendeur de ballons traverse la foule`]),
    ph('slogans', `Derrière le camion sono`,
      `Le cortège s'ébranle sur le boulevard du Temple, derrière le camion sono du « Front commun des Ateliers ». On avance au pas, on s'arrête, on repart ; les slogans montent de l'avant et il faut les attraper au vol. Sur les trottoirs, des gens regardent passer, certains applaudissent, un touriste demande ce qui se passe.`,
      OBJ('o2'), [
        voix('SONO', `Horizon, c'est non ! Horizon, c'est non ! Plus fort, derrière, on ne vous entend pas !`),
        voix('AMI', `Attends-moi, je prends une bouteille d'eau au kiosque. Deux minutes !`),
      ], [`Un ami s'arrête pour acheter une boisson`, `Une fanfare rejoint le cortège`, `Un touriste demande ce qui se passe`]),
    ph('arret', `Le cortège s'arrête sans prévenir`,
      `Dix slogans dans la gorge. À l'entrée du boulevard des Filles du Calvaire, tout s'arrête : le camion sono ne repart pas, la musique se tait, et les rangs se resserrent sans que personne sache pourquoi. Votre ami veut aller voir devant ; à cent mètres, au bout d'une rue, on aperçoit des casques.`,
      T(200), [
        voix('AMI', `Viens, on va voir ce qui bloque ! Il paraît qu'il y a des CRS au carrefour.`),
        voix('SERVICE D\'ORDRE', `On patiente, s'il vous plaît ! Le camion est en panne, on nous ouvre un autre passage. On ne pousse pas !`),
      ], [`Le camion sono tombe en panne`, `Averse de deux minutes`]),
    ph('bastille', `La colonne de Juillet au bout du boulevard`,
      `Le cortège est reparti et descend le boulevard Beaumarchais. Au bout, la colonne de Juillet grandit à chaque pas. Le point de rendez-vous est place de la Bastille, côté rue Saint-Antoine ; encore faut-il y arriver à trois, dans une foule qui s'étire et qui s'éparpille déjà.`,
      OBJ('o1'), [
        voix('AMIE', `On ne se lâche pas jusqu'à la colonne. Si on se perd : côté rue Saint-Antoine, devant la bouche de métro.`),
        voix('MANIFESTANT', `C'est votre première ? Ça se voit, vous souriez encore. Vous verrez, on y prend goût.`),
      ], [`La foule sépare votre groupe un instant`]),
    ph('dispersion', `On rentre par la rue Saint-Antoine`,
      `Place de la Bastille, les organisateurs remercient tout le monde au micro et annoncent la fin. Vous êtes trois, les pieds en compote, la voix cassée. Autour, les banderoles se roulent, les chasubles disparaissent dans les sacs ; la foule repart par la rue Saint-Antoine et les bouches du métro.`,
      FIN, [
        voix('MÉGAPHONE', `Merci à toutes et à tous ! La manifestation est terminée, on se disperse dans le calme, par la rue Saint-Antoine et le métro !`),
        voix('AMIE', `Alors, ta première manif ? On boit un verre et tu me racontes.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Arriver place de la Bastille avec ses deux amis', 'atteindre', { place: 'Place de la Bastille', target: 'amis', count: 2 }),
    ob('o2', 'Reprendre dix slogans', 'personnalise', { target: 'slogan', count: 10 }),
    os('o3', 'Ne jamais s\'éloigner de plus de vingt mètres de ses amis', 'proteger_les_siens', { target: 'amis' }),
    os('o4', 'Rester à plus de dix mètres des lignes de police', 'personnalise', { target: 'contact_avec_les_forces', max: 0 }),
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
    `Boulevard Beaumarchais, un après-midi couvert. Vous marchez avec cinq amis au sein d'un cortège de mille deux cents personnes, contre la hausse des tarifs de l'énergie, avec le « Collectif Lumière Pour Tous ». À l'avant, un groupe encagoulé tire le cortège vers l'affrontement.`,
    `Votre mission est de rester groupé avec vos cinq amis jusqu'à l'arrivée, de reprendre dix slogans et de ne pas laisser un seul d'entre eux se blesser. Vous êtes manifestant pacifique : vous protégez le groupe plus que vous ne lancez des idées.`,
    `Restez au milieu du cortège, à distance de la tête. Si des jets de projectiles commencent, reculez calmement. Prenez la main d'un ami qui s'affole. Cherchez une sortie latérale. Gardez un point de rendez-vous.`,
    `Un cortège pacifique peut être pris dans une tension qu'il n'a pas voulue : la clé est de ne pas paniquer. Ne tentez pas de séparer les violents des autres : ce n'est pas votre rôle.`,
  ],
  place: 'Boulevard Beaumarchais', timeOfDay: 16, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(1200, 'pouvoir_achat', 0.3, 0.5, 0.06, { syndical: 0.3, familles: 0.2, retraites: 0.15, gilets_jaunes: 0.2, etudiants: 0.15 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard du Temple'], 0.45),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille deux cents marcheurs ; ambiance sérieuse, quelques groupes en tête.',
    'Une trentaine d\'individus encagoulés en tête.', ['Boulevard Beaumarchais', 'Boulevard du Temple'],
    ['Rester au milieu du cortège', 'Garder un point de rendez-vous', 'Éviter la tête']),
  phases: [
    ph('milieu-du-cortege', `Six au milieu du cortège`,
      `Seize heures, place de la Bastille. Vous êtes six, serrés au milieu du cortège du « Collectif Lumière Pour Tous », qui s'engage sur le boulevard Beaumarchais. Le point de rendez-vous, si l'on se perd, est fixé à l'entrée du boulevard du Temple. Loin devant, des silhouettes en noir marchent plus vite que tout le monde.`,
      T(200), [
        voix('AMIE', `On reste au milieu, d'accord ? Pas devant. Et si ça tourne mal, rendez-vous à l'entrée du boulevard du Temple.`),
        voix('SONO', `La lumière pour tous ! La lumière pour tous !`),
      ], [`Un vieil homme ralentit votre groupe`]),
    ph('tete-agitee', `La tête s'agite`,
      `Le cortège avance par à-coups. À l'avant, on entend des pétards, puis des cris ; une fumée noire monte au-dessus des têtes. L'un de vos amis veut aller voir, « juste deux minutes » ; un autre regarde déjà les rues latérales du boulevard Beaumarchais.`,
      TENS(0.45), [
        voix('AMI', `Je vais voir devant, je reviens ! Deux minutes, je veux juste comprendre ce qui se passe.`),
        voix('MANIFESTANTE', `Ça chauffe devant, il y en a qui cassent. Ne restez pas là, avec vos amis, reculez un peu.`),
      ], [`Un ami veut aller voir à l'avant`, `Un fumigène noir monte en tête de cortège`]),
    ph('projectiles', `Ce qui tombe à l'avant`,
      `La tension vient de monter : des projectiles partent de la tête, des boucliers apparaissent au bout du boulevard Beaumarchais, et tout le cortège recule d'un coup, comme une vague. Une amie s'est figée, les yeux écarquillés. Lui prendre la main, lui parler, reculer au pas vers une rue latérale : courir, ici, c'est tomber.`,
      T(180), [
        voix('AMIE', `Je… je ne peux pas bouger. Ils vont charger ? Dis-moi qu'ils ne vont pas charger.`),
        voix('SERVICE D\'ORDRE', `On recule calmement ! Par la rue du Pas de la Mule, à droite ! Ne courez pas !`),
      ], [`Une panique soudaine traverse le cortège`, `Une amie se fige`, `Retour de gaz sur le milieu du cortège`]),
    ph('point-de-rendez-vous', `Le rendez-vous du boulevard du Temple`,
      `Le cortège s'est disloqué en trois morceaux. Deux amis ont été emportés par le reflux. Le rendez-vous est à l'entrée du boulevard du Temple, à trois cents mètres ; on peut y aller par le boulevard des Filles du Calvaire, où ça fume encore, ou par les petites rues, plus longues et plus calmes.`,
      OBJ('o5'), [
        voix('AMI', `On est dans une rue derrière, je ne sais pas laquelle ! Il y a des gaz, on n'y voit rien. On vous rejoint au rendez-vous !`),
        voix('AMIE', `Par les petites rues. C'est plus long, mais je ne repasse pas dans la fumée.`),
      ], [`Deux amis sont séparés du groupe`]),
    ph('se-compter', `Se compter sous l'abribus`,
      `À l'entrée du boulevard du Temple, sous un abribus, on se compte. Les yeux rouges, les voix qui tremblent un peu, quelqu'un rit trop fort. Ce n'était pas votre affrontement, et pourtant vous étiez dedans ; ce que chacun racontera ce soir dépendra de ceux qui manquent, ou non, à l'appel.`,
      FIN, [
        voix('AMIE', `Un, deux, trois, quatre… Attends, je recompte.`),
        voix('AMI', `La prochaine fois, on se donne deux points de rendez-vous. Et personne ne va voir devant.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Arriver avec ses cinq amis', 'proteger_les_siens', { target: 'amis', count: 5 }),
    ob('o2', 'Ne laisser personne de son groupe blessé', 'proteger_les_siens', { target: 'amis', max: 0 }),
    os('o3', 'Reprendre dix slogans', 'personnalise', { target: 'slogan', count: 10 }),
    os('o4', 'Éviter la tête du cortège', 'personnalise', { target: 'presence_en_tete', max: 0 }),
    ob('o5', 'Rejoindre le point de rendez-vous, à l\'entrée du boulevard du Temple', 'atteindre', { place: 'Boulevard du Temple' }),
  ],
  failures: [fail('personnalise', 'Groupe dispersé.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
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
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents étudiants, vent soutenu ; ambiance festive et sérieuse.',
    'Aucun signalement.', ['Boulevard Saint-Germain', 'Rue de Rennes'],
    ['Coordonner les virages', 'Serrer les poings dans le vent', 'Garder le rythme']),
  phases: [
    ph('six-metres-de-tissu', `Six mètres de tissu peint`,
      `Quinze heures, place Saint-Michel. La banderole de tête de la « Coordination Étudiante Rive Gauche » fait six mètres de long : « Parcours pour tous ! », en lettres vertes. Vous tenez la hampe de gauche, votre camarade celle de droite, à trois mètres l'un de l'autre ; le vent d'ouest s'engouffre dans le tissu comme dans une voile.`,
      FOULE('depart'), [
        voix('CAMARADE', `Tends plus ! Si elle fait le ventre, le vent nous l'arrache. On marche au même pas, tu comptes avec moi.`),
        voix('MÉGAPHONE', `La banderole devant, s'il vous plaît ! On démarre !`),
      ], [`Un photographe se place devant la banderole`]),
    ph('ligne-droite', `La ligne droite, vent de face`,
      `Le boulevard Saint-Germain s'ouvre devant vous, tout droit, et la banderole tire sur les bras à chaque rafale. Derrière, huit cents personnes règlent leur pas sur le vôtre. Un coin du tissu se déchire à l'œillet ; votre camarade trébuche sur une plaque de chantier et se rattrape de justesse.`,
      T(300), [
        voix('CAMARADE', `Le coin lâche ! Tiens bon, je refais le nœud en marchant.`),
        voix('MANIFESTANT', `Plus haut, la banderole ! On ne lit rien, derrière !`),
      ], [`Une rafale arrache un coin du tissu`, `La camarade trébuche`, `Un chien traverse devant la banderole`]),
    ph('virage', `Le virage de la rue de Rennes`,
      `Le cortège doit tourner dans la rue de Rennes. Une banderole ne tourne pas comme une personne : le côté extérieur accélère, l'intérieur marque le pas, le tissu reste tendu, et tout cela se dit en deux mots par-dessus le bruit. Le vent, dans l'angle, vous prend de travers.`,
      OBJ('o1'), [
        voix('CAMARADE', `Virage ! Toi, tu accélères, moi je ralentis. Maintenant !`),
        voix('SERVICE D\'ORDRE', `Doucement dans le virage, la banderole ! Il y a des poussettes juste derrière vous.`),
      ], [`Le vent prend la banderole de travers dans l'angle`]),
    ph('tissu-roule', `Le tissu roulé`,
      `Un quart d'heure, le tissu tendu d'un bout à l'autre. Rue de Rennes, le cortège ralentit et les organisateurs annoncent l'arrivée. On pose les hampes, on roule la banderole à deux, bord à bord ; vous avez les épaules en feu et de la peinture verte sur les mains.`,
      FIN, [
        voix('CAMARADE', `Mes bras ! Je ne les sens plus. Tu la reprends, la prochaine fois ?`),
        voix('MÉGAPHONE', `Merci aux porteurs de la banderole ! On se disperse par la rue de Rennes, dans le calme !`),
      ]),
  ],
  objectives: [
    ob('o1', 'Garder la banderole tendue pendant tout le parcours', 'rester_dans_cortege', { seconds: 900 }),
    ob('o2', 'Ne jamais la laisser tomber plus de vingt secondes', 'personnalise', { target: 'banderole', seconds: 20 }),
    os('o3', 'Passer les virages sans déchirer le tissu', 'personnalise', { target: 'virage', count: 2 }),
    os('o4', 'Garder le rythme avec sa camarade', 'proteger_les_siens', { target: 'camarade' }),
  ],
  failures: [fail('personnalise', 'Banderole lâchée plus de vingt secondes.', 20), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
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
    `Place du Palais Bourbon, quatorze heures. Vous participez à un sit-in avec cent cinquante autres militants, devant l'Assemblée nationale, pour protester contre le projet de loi « Vigilance », qui étend la surveillance de l'espace public. Vous êtes assis, bras liés. Les CRS arrivent en ligne.`,
    `Votre mission est de décider de rester ou de partir, en comprenant que le délit se constitue après la dernière sommation. Vous pouvez rester assis, partir ou vous faire porter. Chaque choix a une conséquence sur votre situation.`,
    `Écoutez l'annonce : « Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux. » Deux sommations la suivront. Pesez. Si vous restez, restez calme, ne résistez pas physiquement. Si vous partez, partez par la rue de l'Université. Si vous filmez, faites-le sans gêner les agents.`,
    `Rester après la dernière sommation vous expose à une interpellation. Un geste de résistance active aggrave la situation. Votre avocat est joignable par téléphone : mémorisez son numéro.`,
  ],
  intel: intel(
    'Cent cinquante militants assis, bras liés.',
    'Aucun radical.', ['Place du Palais Bourbon', 'Rue de l\'Université'],
    ['Mémoriser le numéro de son avocat', 'Ne pas résister physiquement', 'Choisir avant la dernière sommation']),
  phases: [
    ph('assis', `Assis, bras liés`,
      `Quatorze heures, place du Palais Bourbon. Vous êtes assis sur le pavé avec cent cinquante autres, devant la grille de l'Assemblée nationale, le bras droit passé sous celui d'une inconnue, le gauche sous celui d'un étudiant. On chante contre le projet de loi « Vigilance ». En face, une ligne de CRS se met en place, sans hâte.`,
      T(150), [
        voix('VOISINE', `C'est votre premier sit-in ? Moi aussi. On ne lâche pas les bras, quoi qu'il arrive, c'est ça ?`),
        voix('MILITANT', `Rappel pour tout le monde : on ne résiste pas, on ne frappe pas, on se laisse porter. Et vous avez le numéro de l'avocat sur le bras.`),
      ], [`Un journaliste filme les premiers rangs`]),
    ph('sommations', `Trois phrases au mégaphone`,
      `Un officier ceint d'une écharpe tricolore s'avance sur la place du Palais Bourbon et lève un mégaphone. Trois phrases, à quelques dizaines de secondes d'intervalle, que tout le monde écoute en silence. Après la troisième, rester devient un choix qui a un prix ; partir par la rue de l'Université en est un autre, et personne, ici, ne vous jugera.`,
      OBJ('o5'), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('COMMANDANT', SOMMATIONS.premiere),
        voix('COMMANDANT', SOMMATIONS.derniere),
        voix('VOISINE', `Je… je crois que je vais partir. J'ai mes enfants ce soir. Vous restez, vous ?`),
      ], [`Un voisin se lève pour partir`, `Une personne âgée cherche de l'aide pour se relever`]),
    ph('portage', `Ceux qu'on emporte`,
      `Le choix est fait. Sur la place du Palais Bourbon, les agents s'avancent par deux et emportent ceux qui sont restés, un par un, sous les aisselles et sous les genoux. Chaque départ est salué par un chant. Rester passif, c'est ne pas aider et ne pas résister : un poids mort, les yeux ouverts.`,
      T(300), [
        voix('CRS', `Monsieur, madame, on va vous porter. Laissez-vous faire, on ne vous fera pas mal. Vous pouvez encore vous lever.`),
        voix('MILITANT', `On ne résiste pas ! On les regarde, on chante, c'est tout !`),
      ], [`Un voisin panique au moment d'être saisi`, `Un agent saisit un manifestant brutalement`, `Un malaise dans le groupe assis`]),
    ph('identite', `Le contrôle, au bord de la place`,
      `Au bord de la place, rue de Bourgogne, ceux qui ont été portés attendent debout, en file, sous l'œil de quatre agents. On demande les pièces d'identité ; un gradé explique, d'une voix fatiguée, ce qui peut suivre et ce qui ne suivra pas. Ceux qui sont partis d'eux-mêmes regardent depuis le trottoir d'en face.`,
      FOULE('dispersion'), [
        voix('CRS', `Pièce d'identité, s'il vous plaît. Ceux qui étaient assis jusqu'au bout, par ici : on relève les identités, vous serez informés des suites.`),
        voix('VOISINE', `Je suis restée de l'autre côté de la rue, je n'ai pas osé partir tout à fait. Vous avez vu comme ils les emportaient, un par un ?`),
      ], [`Un policier s'adresse à vous personnellement`]),
    ph('apres', `Ce que chacun a choisi`,
      `La place du Palais Bourbon se vide. Le pavé est jonché de tracts et de bouteilles d'eau ; les caméras rangent leurs pieds. Parti à temps ou porté jusqu'au bout, vous avez le numéro de l'avocat sur l'avant-bras et, pour la première fois, une idée précise de ce que pèse une sommation.`,
      FIN, [
        voix('MILITANT', `Ceux qui ont été contrôlés : vous nous appelez ce soir, tous, même si tout va bien.`),
        voix('VOISINE', `On se revoit à la prochaine ? Je resterai peut-être, cette fois. Ou pas.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rester assis jusqu\'à la dernière sommation ou partir à temps', 'ne_pas_etre_interpelle', { place: 'Place du Palais Bourbon' }),
    ob('o2', 'Ne résister physiquement à aucun moment', 'personnalise', { target: 'resistance_physique', max: 0 }),
    os('o3', 'Mémoriser le numéro d\'un avocat', 'personnalise', { target: 'avocat' }),
    os('o4', 'Aider une personne âgée à partir', 'proteger_les_siens', { target: 'personne_agee' }),
    ob('o5', 'Faire son choix avant la dernière sommation : rester assis ou partir par la rue de l\'Université', 'personnalise', { target: 'choix_assume', count: 1 }),
  ],
  failures: [fail('interpelle', 'Interpellé sans l\'avoir choisi.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
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
    ph('contre-le-mur', `Dos au mur, téléphone à l'horizontale`,
      `Place de la Bastille, dix-neuf heures. La manifestation est finie, mais quatre cents personnes restent, et un engin lanceur d'eau attend derrière la ligne. Vous vous adossez à un mur, à l'angle de la rue de Lyon, le téléphone à l'horizontale : si quelque chose se passe, quelqu'un doit pouvoir le montrer.`,
      T(120), [
        voix('AMIE', `Tu filmes ? Dis l'heure et le lieu à voix basse, au début. Sinon ça ne prouve rien.`),
        voix('COMMANDANT', SOMMATIONS.derniere),
      ], [`Un autre témoin filme à côté de vous`]),
    ph('interpellation', `Une interpellation à trente mètres`,
      `À trente mètres, sur la place de la Bastille, trois policiers sortent du rang et saisissent un homme en veste rouge, qui se débat. Il tombe, on le menotte, on le relève. Tout tient dans votre cadre, si vous ne tremblez pas, si vous ne vous approchez pas à moins de cinq mètres, et si personne ne vient se mettre devant.`,
      OBJ('o1'), [
        voix('MANIFESTANT', `Filmez ! Filmez, ils le tabassent ! Mettez-le sur les réseaux, vite !`),
        voix('CRS', `Vous, avec le téléphone ! Reculez. Vous pouvez filmer, mais reculez de cinq mètres.`),
      ], [`Un policier vous demande de reculer`, `Un manifestant hurle à côté de votre micro`]),
    ph('eau', `L'eau sur la place`,
      `La scène est dans votre téléphone. L'engin lanceur d'eau s'est avancé ; une pluie fine, puis un jet, balaient les premiers rangs de la place de la Bastille. Les embruns arrivent jusqu'à vous, sur l'écran, sur les doigts. Ceux qui lançaient des bouteilles reculent, et ceux qui regardaient reculent avec eux.`,
      T(180), [
        voix('HAUT-PARLEUR DE L\'ENGIN', `Attention, usage du canon à eau. Reculez.`),
        voix('AMIE', `Mets-le dans ta poche, il va prendre l'eau ! On recule vers la rue de Lyon, viens !`),
      ], [`Un jet d'eau mouille votre téléphone`, `Un manifestant glisse sur le pavé mouillé`]),
    ph('publier', `Publier telle quelle, ou couper`,
      `Sous un porche de la rue de Lyon, vous regardez votre vidéo. Une minute douze. On y voit la saisie, pas ce qui l'a précédée ; on entend quelqu'un crier « ils le tabassent » alors que l'image montre autre chose. La publier telle quelle, avec l'heure et le lieu, ou la couper : c'est vous qui signez.`,
      OBJ('o2'), [
        voix('AMIE', `Tu la mets entière. Si tu coupes, on dira que tu as triché. Et écris ce que tu as vu, pas ce que le type criait.`),
        voix('MANIFESTANT', `Envoyez-la-moi, je la poste avec un titre qui tape !`),
      ], [`Un inconnu vous demande la vidéo pour la republier`]),
    ph('vues', `Ce que devient une vidéo`,
      `La vidéo est en ligne. La place de la Bastille se vide, luisante, et votre téléphone vibre sans arrêt : des partages, des commentaires, un message d'un journaliste qui demande à vous parler, un autre d'un inconnu qui vous insulte. Vous n'avez rien fait d'autre que tenir un téléphone droit.`,
      FIN, [
        voix('AMIE', `Deux mille vues en dix minutes. Il y a un journaliste qui te cherche. Tu lui réponds ?`),
        voix('JOURNALISTE', `Bonjour, c'est vous qui avez filmé l'interpellation de la Bastille ? Vous avez la séquence complète ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Filmer l\'interpellation à plus de cinq mètres', 'filmer', { target: 'interpellation', count: 1 }),
    ob('o2', 'Publier la vidéo', 'publier', { count: 1 }),
    os('o3', 'Ne pas gêner l\'action des agents', 'personnalise', { target: 'gene_des_agents', max: 0 }),
    os('o4', 'Garder son téléphone', 'personnalise', { target: 'telephone_conserve' }),
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
    ph('rues-fermees', `Les rues se ferment`,
      `Dix-sept heures, rue de Turbigo. Vous êtes venus à trois soutenir les « Blouses Claires » : votre compagne, votre fils de deux ans dans sa poussette, et vous. D'un coup, des boucliers ferment la rue devant, puis derrière. Autour de vous, des gens en noir courent, des soignantes en blouse lèvent les mains, et personne ne comprend.`,
      T(120), [
        voix('COMPAGNE', `Ils ferment tout ! Pourquoi ils ferment ? On n'a rien fait, nous !`),
        voix('MÉGAPHONE', `Vous êtes retenus pour une durée limitée. Une sortie est ouverte rue Rambuteau. Présentez-vous un par un.`),
      ], [`Un groupe d'individus en noir passe en courant près de la poussette`]),
    ph('trois-rues', `Trois rues, une seule ouverte`,
      `Rue de Turbigo : fermée. Rue Saint-Denis : fermée, et c'est par là que ça lance. Reste la rue Rambuteau, à cent mètres, de l'autre côté d'une foule compacte. Pousser une poussette là-dedans sans pousser personne, sans courir, en tenant la main de votre compagne : la panique est le seul vrai danger.`,
      TENS(0.6), [
        voix('COMPAGNE', `Il pleure. Prends-le dans tes bras, je pousse la poussette vide. Non, attends, garde-le attaché, c'est plus sûr.`),
        voix('MANIFESTANTE', `Vous avez un petit ? Passez devant, passez ! Laissez passer la poussette, s'il vous plaît !`),
      ], [`L'enfant se met à pleurer`, `Un mouvement de foule vous sépare un instant`]),
    ph('nuage', `Le nuage, côté rue Saint-Denis`,
      `La tension monte : une grenade lacrymogène roule à dix mètres, côté rue Saint-Denis, et le nuage s'étale. Tourner la poussette dos à la fumée, baisser la capote, couvrir le visage de l'enfant avec un linge, et s'éloigner au pas, sous le vent. Un inconnu ouvre la porte d'un hall et fait signe d'entrer.`,
      T(150), [
        voix('INCONNU', `Par ici ! Il y a un poste de soins dans le hall, entrez avec le petit, vite !`),
        voix('COMPAGNE', `Ses yeux ! Il se frotte les yeux ! Qu'est-ce qu'on fait ?`),
      ], [`Une grenade lacrymogène tombe à proximité`, `Un inconnu propose l'abri d'un hall`]),
    ph('sortie', `La porte de la rue Rambuteau`,
      `La sortie est là, rue Rambuteau : deux mètres de large entre deux rangées de boucliers, quatre agents, une file qui avance lentement. On y passe un par un, on montre ses papiers. Vous êtes un homme de trente ans au milieu d'un groupe où l'on cherche des hommes de trente ans ; ce qui vous distingue, c'est une poussette.`,
      OBJ('o5'), [
        voix('CRS', `Avancez. La poussette, par ici. Vous êtes ensemble ? Pièce d'identité, monsieur. Madame, passez avec l'enfant.`),
        voix('COMPAGNE', `Je ne passe pas sans lui. On sort tous les trois, ou on reste tous les trois.`),
      ], [`Un agent demande votre pièce d'identité`, `On vous retient un instant pour vérification`]),
    ph('dehors', `De l'autre côté des boucliers`,
      `Rue Rambuteau, de l'autre côté des boucliers, la ville continue comme si de rien n'était : des terrasses, des vélos, une boulangerie ouverte. Derrière vous, le mégaphone répète la même phrase ; vous restez un moment sans parler, la main sur la poignée de la poussette.`,
      FIN, [
        voix('COMPAGNE', `On s'assoit cinq minutes ? J'ai les jambes qui tremblent.`),
        voix('PASSANTE', `Vous venez de là-dedans ? Avec un bébé ? Mon Dieu. Asseyez-vous, je vous apporte de l'eau.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Sortir de l\'îlot avec sa compagne et son enfant', 'proteger_les_siens', { target: 'famille', count: 2 }),
    ob('o2', 'Ne pas pousser ni courir pendant toute l\'attente', 'personnalise', { target: 'calme_conserve' }),
    os('o3', 'Éviter les groupes violents', 'personnalise', { target: 'proximite_groupe_violent', max: 0 }),
    os('o4', 'Sortir en moins de vingt minutes', 'duree', { seconds: 1200 }),
    ob('o5', 'Atteindre la sortie contrôlée de la rue Rambuteau', 'atteindre', { place: 'Rue Rambuteau' }),
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
    `Boulevard Richard-Lenoir, un cortège de huit mille personnes va tourner en direction de la place de la Bastille. Vous êtes du service d'ordre du « Front commun des Ateliers » : brassard, talkie-walkie, chaîne humaine de dix personnes. Votre mission est de protéger le virage.`,
    `Votre mission est de tenir la chaîne pendant que le cortège tourne, d'empêcher les voitures d'entrer dans le cortège et de signaler tout incident à votre responsable. Vous ne lancez jamais rien, vous canalisez.`,
    `Prenez place à l'angle. Tenez la chaîne bras liés. Parlez aux automobilistes : « Désolé, pouvez-vous attendre trois minutes ? » Avertissez le responsable si un groupe tente de forcer. Gardez le talkie-walkie à portée de main.`,
    `Vous n'êtes pas un policier : vous ne touchez personne. Si un automobiliste est agressif, appelez la police. Ne répondez pas aux provocations.`,
  ],
  place: 'Boulevard Richard-Lenoir', timeOfDay: 15.5, weather: 'clair', windFrom: 260, windSpeed: 3,
  crowd: crowd(1500, 'pouvoir_achat', 0.3, 0.4, 0.04, { syndical: 0.45, familles: 0.15, retraites: 0.15, etudiants: 0.15, gilets_jaunes: 0.1 },
    ['Boulevard Richard-Lenoir', 'Place de la Bastille'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit mille marcheurs déclarés ; le virage est un point sensible.',
    'Une trentaine de personnes déterminées en tête.', ['Boulevard Richard-Lenoir', 'Place de la Bastille'],
    ['Tenir la chaîne', 'Parler aux automobilistes', 'Signaler tout incident']),
  phases: [
    ph('chaine', `Dix bras liés à l'angle`,
      `Quinze heures trente, boulevard Richard-Lenoir. Le cortège du « Front commun des Ateliers » va tourner vers la place de la Bastille, et l'angle est le point faible : une rue adjacente y débouche, que personne n'a barrée. Vous êtes dix du service d'ordre, brassard au bras, à fermer ce débouché avec vos corps, bras liés.`,
      T(150), [
        voix('RESPONSABLE', `Dix à l'angle, bras liés, dos au cortège. On ne touche personne, on parle. S'il y a un problème, vous m'appelez au talkie.`),
        voix('CAMARADE', `Je n'ai jamais fait ça. S'il y en a un qui fonce, on fait quoi ?`),
      ], [`Un camarade arrive en retard à son poste`]),
    ph('poussee', `La poussée du virage`,
      `La tête du cortège arrive sur le boulevard Richard-Lenoir et tourne. Dans un virage, une foule se tasse à l'intérieur et déborde à l'extérieur : la poussée vient dans votre dos, par vagues, et la chaîne plie sans rompre. Devant vous, dans la rue adjacente, trois voitures se sont arrêtées ; la première avance d'un mètre, puis d'un autre.`,
      TENS(0.4), [
        voix('RESPONSABLE', `Tenez l'angle ! Le camion sono arrive, il lui faut toute la largeur !`),
        voix('AUTOMOBILISTE', `J'ai un rendez-vous, moi ! Laissez-moi passer, je roule au pas, je ne vais écraser personne !`),
      ], [`Une voiture avance vers la chaîne`, `La poussée du cortège fait plier la chaîne`]),
    ph('automobiliste', `Trois minutes à demander`,
      `La tension monte à l'angle du boulevard Richard-Lenoir : l'automobiliste a baissé sa vitre et klaxonne, la main à plat. Derrière lui, la file s'allonge et s'énerve. Vous n'êtes pas policier : vous ne pouvez ni le toucher ni lui donner un ordre, seulement lui parler, lui demander trois minutes, et prévenir le responsable s'il avance encore.`,
      OBJ('o1'), [
        voix('AUTOMOBILISTE', `Trois minutes, trois minutes ! Ça fait dix minutes que j'attends ! Vous n'avez aucun droit de me bloquer !`),
        voix('CAMARADE', `Il avance ! Il touche presque mes genoux. On appelle la police, non ?`),
      ], [`Un automobiliste klaxonne et avance au contact`, `Un groupe du cortège veut s'en prendre à la voiture`, `Le talkie-walkie tombe en panne`]),
    ph('dernier-char', `Le dernier char`,
      `Dix minutes de chaîne. La queue du cortège passe l'angle du boulevard Richard-Lenoir : des retraités, des poussettes, le dernier char avec ses ballons. Deux gardiens de la paix sont venus se poster devant les voitures. Vos bras sont engourdis ; il faut tenir jusqu'à ce que la dernière personne ait tourné.`,
      T(180), [
        voix('RESPONSABLE', `Encore deux minutes, la queue arrive. Après, vous décrochez et vous remontez sur le flanc.`),
        voix('GARDIEN DE LA PAIX', `On prend les voitures. Vous, vous restez avec votre cortège.`),
      ], [`Deux gardiens de la paix viennent se poster devant les voitures`]),
    ph('bras-delies', `Les bras déliés`,
      `Le virage est passé. La chaîne se défait, on secoue les bras, on rit de soulagement. Boulevard Richard-Lenoir, les voitures repartent une à une derrière le cortège ; l'automobiliste de tout à l'heure passe au pas, vitre baissée, sans regarder personne.`,
      FIN, [
        voix('RESPONSABLE', `Tout le monde a ses dix doigts ? Bien. On remonte en queue de cortège, et vous me racontez l'histoire de la voiture.`),
        voix('CAMARADE', `J'ai cru qu'il allait me rouler dessus. Moi, à ta place, je l'aurais insulté.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir la chaîne pendant tout le virage', 'proteger_les_siens', { target: 'chaine', seconds: 600 }),
    ob('o2', 'Empêcher toute voiture d\'entrer dans le cortège', 'personnalise', { target: 'voiture_dans_le_cortege', max: 0 }),
    os('o3', 'Ne porter aucun coup', 'personnalise', { target: 'coup_porte', max: 0 }),
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
    `Votre ennemi n'est pas le bloc, c'est l'escalade. Ne touchez personne. Vous ne pouvez pas empêcher les violents de s'avancer : vous pouvez seulement protéger le carré.`,
  ],
  place: 'Boulevard Voltaire', timeOfDay: 14.5, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(1200, 'retraites', 0.35, 0.5, 0.08, { syndical: 0.5, retraites: 0.2, black_bloc: 0.08, familles: 0.1, etudiants: 0.12 },
    ['Place de la République', 'Boulevard Voltaire'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six mille marcheurs ; un précortège de trois cents en avant.',
    'Une centaine d\'individus encagoulés.', ['Boulevard Voltaire'],
    ['Tenir le flanc du carré', 'Parler au précortège', 'Appeler un renfort']),
  phases: [
    ph('carre-de-tete', `La chaîne devant le carré de tête`,
      `Quatorze heures trente, place de la République. Derrière la banderole, les responsables du « Front commun des Ateliers » forment le carré de tête ; autour d'eux, le service d'ordre fait la chaîne, bras liés, brassard au bras. Vous tenez le flanc gauche. Devant, hors de la chaîne, un précortège se rassemble déjà, que personne n'a invité.`,
      FOULE('depart'), [
        voix('RESPONSABLE', `Flanc gauche, serrez. On garde trente mètres avec ceux de devant. Personne ne lâche les bras sans me prévenir.`),
        voix('CAMARADE', `Ils sont combien, devant ? Deux cents ? Ils ne vont pas nous laisser défiler tranquilles.`),
      ], [`Un précortège se rassemble devant la banderole`]),
    ph('trente-metres', `Trente mètres d'écart`,
      `Le cortège s'engage sur le boulevard Voltaire. Trente mètres séparent votre banderole du précortège : assez pour qu'on ne vous confonde pas, à condition de les tenir. Quand ceux de devant ralentissent, il faut ralentir ; quand ils s'arrêtent, s'arrêter, et expliquer aux milliers de personnes de derrière pourquoi on n'avance plus.`,
      TENS(0.5), [
        voix('RESPONSABLE', `Ils ralentissent exprès. On s'arrête. Je préviens le camion sono.`),
        voix('MANIFESTANTE', `Pourquoi on s'arrête encore ? Avancez, on étouffe derrière !`),
      ], [`Le précortège ralentit pour se faire rattraper`, `Un fumigène est jeté vers le carré`]),
    ph('vingt-perturbateurs', `Vingt qui veulent entrer`,
      `La tension monte sur le boulevard Voltaire. Une vingtaine d'individus masqués quittent le précortège et reviennent vers vous : ils veulent passer derrière votre chaîne, se fondre dans le carré, s'abriter derrière les retraités. Vous ne pouvez ni les frapper ni les retenir par la force : seulement tenir les bras, et parler.`,
      T(200), [
        voix('INDIVIDU MASQUÉ', `Laissez-nous passer, camarades ! On est du même côté, non ? Ou vous faites la police, maintenant ?`),
        voix('RESPONSABLE', `On ne les laisse pas entrer. Poliment, fermement. Si un coup part, vous reculez et vous m'appelez.`),
      ], [`Vingt individus masqués tentent d'entrer dans le carré`, `Un militant du service d'ordre veut en découdre`, `Un journaliste se glisse dans le carré`]),
    ph('delestage', `Demander un autre chemin`,
      `Le précortège ne décollera plus, et devant lui des boucliers barrent le boulevard Voltaire. Rester là, c'est offrir tout le cortège aux gaz des autres. Le responsable cherche l'équipe de liaison de la police ; en attendant, la chaîne doit tenir autour du carré, un quart d'heure en tout depuis le départ.`,
      OBJ('o1'), [
        voix('RESPONSABLE', `J'ai la liaison au téléphone. Ils proposent de nous ouvrir une rue à droite pour contourner. Tenez la chaîne pendant que je négocie.`),
        voix('CAMARADE', `Ça gaze devant ! Le vent nous le ramène. Je ne vois plus rien, mais je ne lâche pas.`),
      ], [`Retour de gaz sur le carré de tête`, `Un militant âgé s'effondre dans le carré`]),
    ph('contournement', `Le cortège contourne`,
      `Un quart d'heure, et le carré n'a pas été traversé. Sur un signe de la liaison, la banderole tourne à droite dans une rue que les policiers viennent d'ouvrir, et le cortège suit, laissant le boulevard Voltaire au précortège et aux boucliers. La chaîne se défait d'elle-même, un bras après l'autre.`,
      FIN, [
        voix('RESPONSABLE', `On passe par la droite, tout le monde suit la banderole ! Service d'ordre, vous fermez la marche et vous comptez vos camarades.`),
        voix('MANIFESTANTE', `C'est vous qui teniez la chaîne ? Merci. Mon père est dans le carré, il a quatre-vingts ans.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Protéger le carré de tête jusqu\'à l\'arrivée', 'proteger_les_siens', { target: 'carre', seconds: 900 }),
    ob('o2', 'Ne porter aucun coup', 'personnalise', { target: 'coup_porte', max: 0 }),
    os('o3', 'Convaincre trois individus de rester derrière', 'personnalise', { target: 'persuasion', count: 3 }),
    os('o4', 'Prévenir le responsable à chaque incident', 'personnalise', { target: 'signalement', count: 2 }),
  ],
  failures: [fail('personnalise', 'Carré envahi.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
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
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un groupe casse à deux cents mètres.',
    'Une cinquantaine d\'individus encagoulés.', ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Prendre les trois militants à part', 'Écouter avant de parler', 'Proposer une alternative']),
  phases: [
    ph('trois-jeunes', `Trois jeunes et un téléphone`,
      `Dix-sept heures trente, rue de Rivoli. Le cortège syndical se disperse. Trois jeunes militants de votre organisation se sont arrêtés autour d'un téléphone : des images de vitrines brisées, tournées il y a deux minutes, à deux cents mètres d'ici, rue de Castiglione. Ils rangent leurs chasubles dans leurs sacs. Vous êtes responsable du service d'ordre local.`,
      T(100), [
        voix('JEUNE MILITANT', `Regarde ça ! Eux, au moins, ils font quelque chose. Nous, on marche depuis trois heures et tout le monde s'en fiche.`),
        voix('CAMARADE', `Ils vont y aller. Si tu veux les retenir, c'est maintenant, et ce n'est pas en leur criant dessus.`),
      ], [`Un message en ligne appelle à rejoindre la casse`]),
    ph('ecouter', `Écouter d'abord`,
      `Les prendre à part, sous une arcade de la rue de Rivoli, et commencer par se taire. Ils ont vingt ans, de la colère, et l'impression que marcher ne sert à rien. Leur dire qu'on comprend, sans mentir ; leur dire ce que coûte une interpellation, sans faire la morale ; leur proposer autre chose que de rentrer chez eux.`,
      OBJ('o2'), [
        voix('JEUNE MILITANTE', `Tu vas nous dire que c'est mal, c'est ça ? Tu vas nous parler de notre casier ? On le sait déjà, tout ça.`),
        voix('JEUNE MILITANT', `Donne-moi une seule raison de rester. Une seule. Et ne me dis pas que ça changera plus tard.`),
      ], [`L'un des trois hausse le ton`, `Un policier passe à proximité et les dévisage`]),
    ph('deux-cents-metres', `Deux cents mètres plus loin`,
      `Ils vous ont écouté. Rue de Castiglione, on entend des détonations, des sirènes, puis les motos de la police qui remontent la rue de Rivoli en colonne. Les trois regardent passer les gyrophares en silence ; l'un d'eux a toujours la main sur la bretelle de son sac, et un pied dans cette direction.`,
      FOULE('dispersion'), [
        voix('JEUNE MILITANT', `Tu vois, ils arrivent. Ceux qui y sont vont se faire attraper… Mon cousin y est, je crois.`),
        voix('CAMARADE', `Reste avec eux. Je vais chercher des cafés. Tant qu'ils parlent, ils ne partent pas.`),
      ], [`Des motos de police remontent la rue`, `Un ami de l'organisation arrive en renfort`]),
    ph('apres-la-casse', `Ce qu'on se dit après`,
      `La rue de Rivoli se vide. Là-bas, la casse a pris fin ; il en reste des vitrines à terre et, dit-on, des gardes à vue. Les jeunes militants sont assis sur un rebord, un gobelet à la main. Ce que vous leur avez promis tout à l'heure, il faudra le tenir : c'est à cela qu'ils jugeront si vous leur avez parlé, ou si vous les avez seulement retenus.`,
      FIN, [
        voix('JEUNE MILITANTE', `Tu avais dit qu'on en reparlerait en réunion, de ce qu'on peut faire d'autre. C'est vrai, ou c'était pour qu'on reste ?`),
        voix('RESPONSABLE', `Ils sont encore là ? Dis-moi comment ça s'est passé, ça m'intéresse.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Retenir au moins deux des trois militants', 'proteger_les_siens', { target: 'militants', count: 2 }),
    ob('o2', 'Les persuader sans élever la voix', 'personnalise', { target: 'persuasion' }),
    os('o3', 'Ne pas mentir à un militant', 'personnalise', { target: 'mensonge', max: 0 }),
    os('o4', 'Éviter qu\'ils se fassent interpeller', 'proteger_les_siens', { target: 'interpellation_evitee' }),
  ],
  failures: [fail('personnalise', 'Deux militants sont partis.'), fail('interpelle', 'Un militant est interpellé.')],
  randomEvents: ['L\'un d\'eux hausse le ton', 'Un message en ligne les excite', 'Un policier passe à proximité', 'Un ami arrive en renfort'],
  unique: 'Désamorcer : la mission la plus difficile consiste à convaincre les siens.',
  tags: ['service-ordre', 'dialogue'],
});

export { MF_10, MF_11, MF_12, MF_13, MF_14, MF_15, MF_16, MF_17 };

export const MANIFESTANT: MissionDef[] = [
  MF_01, MF_02, MF_03, MF_04, MF_05, MF_06, MF_07, MF_08, MF_09,
  MF_10, MF_11, MF_12, MF_13, MF_14, MF_15, MF_16, MF_17,
];
