/* =====================================================================================
 * Catalogue — secouriste : sapeur-pompier de Paris (fourgon, lance, extincteur, secours à victime).
 * Il dépend de la protection des forces de l'ordre pour travailler. Rôle civil de la carrière :
 * ses missions s'ouvrent quand leur mission miroir est terminée.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, scene, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_08, CDT_09, CDT_11 } from './commandant';
import { CRS_09 } from './crs';

const POMP: Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> = { role: 'secouriste', rank: null, poste: null, profile: null };

export const POMP_01 = mission({
  ...POMP, type: 'protection_secours', difficulty: 3, chapter: 13,
  id: 'pompier-01-sous-protection',
  title: 'Sous protection',
  pitch: 'Obtenir un couloir de la part d\'une ligne de CRS pour extraire une urgence absolue en moins de quatre minutes.',
  briefing: [
    `Avenue de l'Opéra, une manifestation dégénère. Un manifestant est tombé inconscient à cent mètres du poste de secours, en pleine zone de jets de projectiles. Votre engin de sapeurs-pompiers de Paris est stationné à trois cents mètres. Vous êtes secouriste.`,
    `Votre mission est d'obtenir un couloir d'accès auprès des forces de l'ordre, d'atteindre la victime en moins de quatre minutes, de la stabiliser et de l'évacuer. Sans protection, vous ne pouvez pas entrer.`,
    `Appelez le commandant au poste de commandement mobile. Demandez : « Couloir pour SANTÉ UN. » Avancez derrière les boucliers. Mettez la victime sur le brancard. Revenez dans le couloir. Rendez compte.`,
    `Ne forcez jamais une ligne : vous risquez de la désorganiser. Un pompier blessé est une victime de plus. Votre casque et votre veste sont des protections : ne les retirez pas.`,
  ],
  place: 'Avenue de l\'Opéra', timeOfDay: 18, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.55, 0.65, 0.2, { gilets_jaunes: 0.3, black_bloc: 0.2, syndical: 0.15, curieux: 0.35 },
    ['Avenue de l\'Opéra', 'Place de l\'Opéra'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; une victime inconsciente à cent mètres.',
    'Une soixantaine d\'individus déterminés.', ['Avenue de l\'Opéra', 'Place de l\'Opéra'],
    ['Demander un couloir', 'Avancer derrière les boucliers', 'Rendre compte']),
  phases: [
    ph('appel', `Une victime dans la zone des jets`,
      `Avenue de l'Opéra, votre fourgon est à l'arrêt à trois cents mètres de la place de l'Opéra, moteur tournant, derrière les lignes. Un manifestant est tombé inconscient au milieu de la chaussée, dans la zone où pleuvent les projectiles. Sans couloir ni protection, vous n'irez pas : un pompier blessé, c'est une victime de plus.`,
      T(40), [
        rad('CENTRAL', 'SAPEUR 1', `Victime inconsciente avenue de l'Opéra, à CENT mètres devant la ligne de MISTRAL UN. Zone non sécurisée. Prenez contact avec lui pour un couloir.`),
        voix('CHEF D\'AGRÈS', `Casque, visière, veste fermée. On prend le brancard et le sac, rien d'autre. Et on ne force rien.`),
      ], [`Un projectile rebondit sur le fourgon`]),
    ph('couloir', `Cent mètres derrière les boucliers`,
      `La ligne de CRS s'ouvre sur trois mètres cinquante et un groupe vous encadre, boucliers levés. Cent mètres à pied sur l'avenue de l'Opéra, au rythme des porteurs de bouclier, jusqu'à l'homme étendu : contrôle de la respiration, collier cervical, brancard, et retour par le même couloir.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'SAPEUR 1', `Couloir ouvert, largeur TROIS mètres CINQ-ZÉRO. Un groupe vous escorte. Vous avancez à mon rythme, pas au vôtre.`),
        voix('ÉQUIPIER', `Il respire. Pas de réponse à la voix. Je prends la tête, tu prends les pieds.`),
      ], [`Un projectile tombe à dix mètres du brancard`, `La ligne recule de dix mètres pendant l'approche`, `Un manifestant propose d'aider à porter`]),
    ph('retour', `Le retour, brancard chargé`,
      `La victime est sur le brancard. Reste à refaire les cent mètres en sens inverse, deux porteurs, les mains prises, sous la protection de boucliers qui encaissent pour vous. À l'arrière, l'ambulance du SAMU s'est avancée jusqu'à l'angle de la rue des Pyramides.`,
      T(150), [
        rad('SANTÉ 1', 'SAPEUR 1', `En attente angle rue des Pyramides. Annoncez-moi le bilan avant d'arriver : conscience, respiration, lésions.`),
        voix('CHEF D\'AGRÈS', `On ne court pas avec un brancard. Si ça tombe, on pose, on se baisse, on repart.`),
      ], [`La victime reprend conscience et s'agite`]),
    ph('transmission', `La transmission au SAMU`,
      `Le brancard passe du fourgon rouge à l'ambulance, à l'angle de la rue des Pyramides, et le médecin du SAMU écoute votre bilan sans lever les yeux de la victime. Derrière vous, la ligne s'est refermée sur l'avenue de l'Opéra. Il reste à rendre compte, à nettoyer le brancard, et à se tenir prêt pour le suivant.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte de votre intervention, puis remettez-vous en attente. D'autres appels arrivent sur le secteur.`),
        voix('CHEF D\'AGRÈS', `Tout le monde est entier ? Montrez-moi vos casques.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Obtenir un couloir et atteindre la victime en moins de quatre minutes', 'secourir', { target: 'urgence_absolue', count: 1, seconds: 240 }),
    ob('o2', 'Évacuer la victime sans blesser un secouriste', 'limiter_blesses', { max: 0 }),
    os('o3', 'Rendre compte par radio à chaque étape', 'personnalise', { target: 'compte_rendu', count: 3 }),
    os('o4', 'Ne pas forcer la ligne', 'personnalise', { target: 'ligne_forcee', max: 0 }),
  ],
  failures: [fail('victime_non_secourue', 'Délai dépassé : la victime n\'est pas extraite.', 240), fail('joueur_hors_combat', 'Équipe blessée.')],
  randomEvents: ['Un projectile touche l\'engin', 'La ligne se replie', 'Un manifestant aide à porter', 'La victime reprend conscience'],
  unique: 'Le pompier dépend de la protection : sans couloir, on ne soigne pas.',
  tags: ['couloir', 'urgence'],
});

export const POMP_02 = mission({
  ...POMP, type: 'protection_secours', difficulty: 3, chapter: 13,
  id: 'pompier-02-feu-de-facade',
  title: 'Feu de façade',
  pitch: 'Une poubelle brûle contre un immeuble qui menace de s\'enflammer : éteindre, puis évacuer deux riverains.',
  briefing: [
    `Boulevard Saint-Germain, des manifestants se sont dispersés en laissant derrière eux plusieurs feux. Une poubelle brûle contre la façade d'un immeuble ancien. Des fumées montent à l'étage. Deux habitants sont à leurs fenêtres. Vous êtes sapeur-pompier de Paris.`,
    `Votre mission est d'éteindre la poubelle avant que le feu ne gagne le balcon du premier étage, puis d'évacuer les deux riverains par l'escalier. La priorité est l'extinction rapide.`,
    `Déroulez la lance. Attaquez la base des flammes. Éteignez, refroidissez. Montez à l'étage avec un collègue. Évacuez les deux habitants. Un agent de police sécurise la rue.`,
    `Ne mouillez pas les câbles électriques. Ne laissez pas un habitant remonter. La fumée est toxique : portez l'appareil respiratoire.`,
  ],
  place: 'Boulevard Saint-Germain', timeOfDay: 20, weather: 'clair', windFrom: 260, windSpeed: 2,
  crowd: crowd(200, '', 0.3, 0.4, 0.05, { curieux: 0.7, riverains: 0.3 },
    ['Boulevard Saint-Germain'], 0.1),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux cents personnes ; un feu de façade, deux riverains.',
    'Aucun radical.', ['Boulevard Saint-Germain', 'Rue de Rennes'],
    ['Éteindre à la lance', 'Évacuer par l\'escalier', 'Porter l\'appareil respiratoire']),
  phases: [
    ph('facade', `Une poubelle contre la pierre`,
      `Boulevard Saint-Germain, vingt heures. Les manifestants sont partis en laissant des feux derrière eux ; l'un d'eux, une poubelle renversée, brûle contre la façade d'un immeuble ancien, à l'angle de la rue de Rennes. La fumée monte le long de la pierre et entre par une fenêtre du deuxième étage, où deux habitants font des signes.`,
      T(50), [
        rad('CENTRAL', 'SAPEUR 1', `Feu de poubelle contre façade, boulevard Saint-Germain, angle rue de Rennes. Deux personnes signalées aux fenêtres. Zone calme, une patrouille sécurise la rue.`),
        voix('CHEF D\'AGRÈS', `Lance en eau, on attaque la base. Binôme d'exploration : appareil respiratoire, prêts à monter.`),
      ]),
    ph('base-des-flammes', `La base des flammes`,
      `La lance se déroule sur le trottoir du boulevard Saint-Germain. Jet diffusé à la base, pas dans les flammes, et jamais vers la gouttière où court un câble électrique ; la poubelle fond en une flaque noire qui coule vers la porte cochère. Au-dessus, une vitre éclate sous la chaleur.`,
      OBJ('o1'), [
        voix('ÉQUIPIER', `Câble électrique sur la façade, à gauche de la fenêtre ! Garde ton jet à droite !`),
        voix('RIVERAINE', `On ne peut pas descendre, la cage d'escalier est pleine de fumée !`),
      ], [`Une fenêtre éclate sous la chaleur`, `Un autre départ de feu est signalé à cinquante mètres`]),
    ph('escalier', `Deux habitants au deuxième étage`,
      `Le foyer est noyé, mais l'escalier de l'immeuble du boulevard Saint-Germain est plein d'une fumée âcre de plastique brûlé. Appareil respiratoire sur le dos, vous montez avec un collègue jusqu'au deuxième étage, à tâtons, la main sur la rampe : deux habitants à faire descendre, dont un qui ne veut pas laisser son chat.`,
      OBJ('o2'), [
        voix('RIVERAIN', `Je ne pars pas sans lui ! Il est sous le lit, il a peur, laissez-moi le chercher !`),
        rad('MISTRAL 2', 'SAPEUR 1', `Je tiens la rue devant l'immeuble. Des curieux reviennent, je les garde à distance de vos tuyaux.`),
      ], [`Un habitant refuse de descendre`, `Des curieux reviennent vers l'immeuble`]),
    ph('reconnaissance', `La reconnaissance, étage par étage`,
      `Les deux habitants sont sur le trottoir, une couverture sur les épaules. Il reste à faire ce que personne ne voit : remonter, ouvrir les fenêtres, passer la main sur les murs, vérifier que rien ne couve derrière un volet ou sous un plancher, du rez-de-chaussée aux combles de cet immeuble du boulevard Saint-Germain.`,
      FIN, [
        voix('CHEF D\'AGRÈS', `Reconnaissance complète. Tu touches les murs : si c'est chaud, tu m'appelles. Personne ne remonte chez lui avant mon feu vert.`),
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte en fin de reconnaissance. Un autre feu de poubelle vous attend rue du Four.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éteindre la poubelle avant qu\'elle ne gagne le balcon', 'eteindre', { target: 'poubelle', place: 'Boulevard Saint-Germain', count: 1 }),
    ob('o2', 'Évacuer deux riverains par l\'escalier', 'evacuer', { target: 'riverain', count: 2 }),
    os('o3', 'Ne pas mouiller les câbles électriques', 'personnalise', { target: 'cable_mouille', max: 0 }),
    os('o4', 'Contrôler le bâtiment après extinction', 'personnalise', { target: 'reconnaissance' }),
  ],
  failures: [fail('personnalise', 'Un étage est en feu.'), fail('victime_non_secourue', 'Un riverain est intoxiqué.')],
  randomEvents: ['Une fenêtre éclate', 'Un habitant refuse de descendre', 'Un jet de projectile', 'Un autre départ de feu'],
  unique: 'Un feu d\'immeuble : la difficulté n\'est pas l\'ennemi mais le temps.',
  tags: ['feu', 'facade'],
});

export const POMP_03 = mission({
  ...POMP, type: 'catastrophe', difficulty: 4, chapter: 13,
  id: 'pompier-03-poste-avance',
  title: 'Poste avancé',
  pitch: 'Tenir le point de rassemblement des victimes : douze blessés, tri par couleur, quatre évacuations dans l\'ordre.',
  briefing: [
    `Place de la Concorde, une panique de foule a fait douze blessés après une explosion de pétards. Un poste de secours avancé est installé près de l'obélisque. Les ambulances sont à dix minutes. Vous êtes responsable du poste.`,
    `Votre mission est de trier les douze victimes par couleur, de traiter les urgences absolues d'abord, d'organiser quatre évacuations dans l'ordre et de tenir le poste jusqu'à l'arrivée des renforts.`,
    `Assignez à chaque blessé un bracelet de couleur. Rouge : détresse vitale. Jaune : urgence relative. Vert : léger. Traitez. Demandez les ambulances. Évacuez les rouges d'abord.`,
    `Une urgence absolue évacuée après une relative est une faute grave. Ne vous laissez pas distraire par les cris. Gardez un œil sur l'ensemble du poste.`,
  ],
  place: 'Place de la Concorde', timeOfDay: 22, weather: 'clair', windFrom: 250, windSpeed: 2,
  crowd: crowd(800, '', 0.3, 0.3, 0.01, { fetards: 0.5, familles: 0.2, curieux: 0.3 },
    ['Place de la Concorde'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 3, samu: 3 }),
  intel: intel(
    'Huit cents personnes ; douze victimes.',
    'Aucun radical.', ['Place de la Concorde', 'Rue Royale'],
    ['Trier par couleur', 'Évacuer les rouges d\'abord', 'Garder le poste ouvert']),
  phases: [
    ph('douze-victimes', `Douze victimes au pied de l'obélisque`,
      `Vingt-deux heures, place de la Concorde. Des pétards, un cri, une foule qui court : douze personnes sont à terre ou assises près de l'obélisque, piétinées, tombées, choquées. Le poste de secours avancé, c'est vous : une bâche, des bracelets de trois couleurs, et dix minutes avant la première ambulance.`,
      T(90), [
        rad('CENTRAL', 'SAPEUR 1', `Mouvement de foule place de la Concorde, UN-DEUX victimes signalées. Vous êtes poste avancé. Première ambulance dans UN-ZÉRO minutes.`),
        voix('CHEF D\'AGRÈS', `Bracelets : rouge, jaune, vert. Tu tries, tu ne soignes pas encore. Trente secondes par victime.`),
      ], [`Des victimes sont amenées par des passants`]),
    ph('tri', `Rouge, jaune, vert`,
      `Elles arrivent portées par des inconnus, soutenues par des amis, ou sur leurs deux jambes en se tenant un poignet. Celle qui hurle a une cheville cassée ; celui qui ne dit rien, assis contre le socle d'une fontaine de la place de la Concorde, respire trop vite et trop court. Douze bracelets à poser, et l'ordre dans lequel on les pose compte déjà.`,
      OBJ('o1'), [
        voix('PROCHE', `C'est mon fils ! Il s'est fait marcher dessus ! Pourquoi vous regardez les autres avant lui ?`),
        voix('ÉQUIPIER', `Le monsieur silencieux, là-bas : il est gris. Regarde-le avant la cheville.`),
      ], [`Un proche exige que son fils passe en premier`, `Une victime silencieuse respire de plus en plus mal`]),
    ph('ordre-des-departs', `L'ordre des départs`,
      `Douze bracelets posés, quatre rouges. Les ambulances arrivent une à une par la rue Royale, et chacune n'emporte qu'une victime couchée. Les rouges d'abord, dans l'ordre de gravité, quoi que disent ceux qui crient le plus fort ; pendant ce temps, quelqu'un doit continuer à regarder les verts.`,
      OBJ('o2'), [
        rad('SANTÉ 1', 'SAPEUR 1', `Première ambulance sur place par la rue Royale. Je prends une victime couchée. Laquelle ?`),
        rad('SANTÉ 2', 'SAPEUR 1', `Deuxième ambulance retardée : CINQ minutes de plus.`),
        voix('ÉQUIPIER', `Le vert au poignet, il vient de vomir. Il se plaint de la tête, maintenant.`),
      ], [`Une ambulance est en retard`, `Un cas classé vert s'aggrave`, `Panne de radio pendant une transmission`]),
    ph('poste-ouvert', `Le poste reste ouvert`,
      `Les quatre rouges sont partis. Sous la bâche, il reste huit personnes : des jaunes à surveiller, des verts qui veulent rentrer chez eux, des proches qui veulent des nouvelles. La place de la Concorde s'est vidée autour du poste ; il ne fermera que lorsque la dernière victime aura une destination.`,
      T(200), [
        voix('PROCHE', `Où est-ce qu'ils l'ont emmenée ? Quel hôpital ? On ne me dit rien !`),
        rad('CENTRAL', 'SAPEUR 1', `Deux ambulances supplémentaires pour vos jaunes dans HUIT minutes. Gardez le poste ouvert.`),
      ], [`Un proche cherche où a été emmenée une victime`]),
    ph('registre', `Le registre du poste`,
      `La dernière ambulance quitte la place de la Concorde par la rue Royale. On replie la bâche, on ramasse les emballages. Reste le registre : douze lignes, une couleur, une heure de départ, une destination ; s'il y a une erreur dans l'ordre, c'est là qu'elle se lira.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Transmettez le registre du poste avancé : victimes, catégories, heures de départ, destinations.`),
        voix('CHEF D\'AGRÈS', `Relis-moi l'ordre des départs. Le premier parti, c'était bien le plus grave ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Trier les douze victimes par couleur', 'soigner', { target: 'victime', count: 12 }),
    ob('o2', 'Évacuer les quatre rouges dans l\'ordre', 'secourir', { target: 'rouge', count: 4 }),
    os('o3', 'Ne laisser aucun vert s\'aggraver', 'limiter_blesses', { max: 0 }),
    os('o4', 'Maintenir le poste ouvert jusqu\'à la fin', 'proteger_site', { target: 'poste_avance', place: 'Place de la Concorde' }),
  ],
  failures: [fail('victime_non_secourue', 'Une urgence absolue est évacuée après une relative.'), fail('trop_de_blesses', 'Trop de victimes graves.', 4)],
  randomEvents: ['Un vert s\'aggrave', 'Une ambulance est en retard', 'Un proche demande à voir un blessé', 'Une panne de radio'],
  unique: 'Le poste avancé : l\'ordre des évacuations est la mission.',
  tags: ['tri', 'poste-avance'],
});

export const POMP_04 = mission({
  ...POMP, type: 'protection_secours', difficulty: 4, chapter: 13,
  id: 'pompier-04-pris-a-partie',
  title: 'Pris à partie',
  pitch: 'L\'engin est visé par des projectiles pendant une extinction : se replier, revenir avec une protection.',
  briefing: [
    `Rue du Temple, un feu de voiture est allumé en travers de la rue. Votre fourgon l'attaque quand un groupe d'une trentaine d'individus se met à lancer des projectiles sur l'engin. Une vitre est brisée. Un collègue est touché au casque.`,
    `Votre mission est de vous replier avec l'engin et l'équipe, d'obtenir une protection des forces de l'ordre, puis de revenir terminer l'extinction. Votre engin doit être préservé : sans lui, rien ne s'éteint.`,
    `Coupez la lance, repliez les tuyaux. Reculez de cinquante mètres en marche arrière. Appelez : « SANTÉ UN, pris à partie, demande protection. » Attendez la ligne de CRS. Revenez à l'abri de leurs boucliers.`,
    `Ne répondez jamais aux projectiles. Un pompier blessé est une perte pour la mission. Si l'engin est immobilisé, mettez l'équipe à l'abri et rendez compte : on ne défend pas un véhicule avec des hommes.`,
  ],
  place: 'Rue du Temple', timeOfDay: 21, weather: 'couvert', windFrom: 240, windSpeed: 2,
  crowd: crowd(150, '', 0.6, 0.7, 0.35, { black_bloc: 0.4, curieux: 0.3, fetards: 0.3 },
    ['Rue du Temple', 'Rue Rambuteau'], 0.1),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 2, samu: 1 }),
  intel: intel(
    'Cent cinquante personnes ; un groupe agressif près d\'un feu de voiture.',
    'Une trentaine d\'individus déterminés.', ['Rue du Temple', 'Rue Rambuteau'],
    ['Se replier en marche arrière', 'Demander la protection', 'Ne pas répondre']),
  phases: [
    ph('feu-de-voiture', `Une voiture en travers de la rue`,
      `Vingt et une heures, rue du Temple. Une voiture brûle en travers de la chaussée, entre deux façades étroites. Votre fourgon est en station à vingt mètres, la lance en eau ; sur les trottoirs, une trentaine de silhouettes regardent travailler les pompiers, capuches relevées, sans rien dire.`,
      TENS(0.7), [
        rad('CENTRAL', 'SAPEUR 1', `Feu de véhicule rue du Temple. Pas d'unité de police sur place pour l'instant : MISTRAL UN est à CINQ minutes.`),
        voix('CHEF D\'AGRÈS', `On attaque, mais vous gardez un œil derrière. Je n'aime pas ceux qui nous regardent.`),
      ], [`Des individus encapuchonnés observent l'intervention`]),
    ph('projectiles', `Les projectiles sur l'engin rouge`,
      `La tension monte d'un coup dans la rue du Temple : une bouteille, puis des pavés, sur le fourgon et sur vous. Une vitre de la cabine éclate, un collègue prend un pavé sur le casque et met un genou à terre. On ne répond pas, on ne défend pas un véhicule avec des hommes : on coupe la lance et on dégage.`,
      T(60), [
        voix('CHEF D\'AGRÈS', `On coupe ! Lance à terre, tout le monde derrière l'engin ! On ne répond pas !`),
        voix('ÉQUIPIER', `Il a pris un pavé ! Le casque a tenu, mais il voit trouble !`),
      ], [`Une vitre de l'engin est brisée`, `Un collègue est touché au casque`]),
    ph('repli', `Cinquante mètres en marche arrière`,
      `Tuyaux abandonnés sur la chaussée, l'engin recule de cinquante mètres dans la rue du Temple, en marche arrière, guidé à la voix. La voiture brûle toujours, et le feu commence à lécher un scooter garé contre un mur. Sur la fréquence, une seule demande : une protection, tout de suite.`,
      T(120), [
        rad('CENTRAL', 'SAPEUR 1', `Reçu : pris à partie. MISTRAL UN arrive par la rue Rambuteau, TROIS minutes. Restez à distance, ne vous réengagez pas seuls.`),
        voix('CHEF D\'AGRÈS', `On attend la ligne. Je sais, ça brûle. On attend quand même.`),
      ], [`Le feu gagne un scooter`, `La ligne de CRS est en retard`]),
    ph('sous-les-boucliers', `Retour sous les boucliers`,
      `Les CRS débouchent de la rue Rambuteau et se mettent en ligne entre vous et le groupe. À l'abri des boucliers, l'engin revient à vingt mètres de la voiture ; on récupère les tuyaux, on remet en eau, et on attaque de nouveau, par l'arrière du véhicule, jamais par l'avant.`,
      OBJ('o2'), [
        rad('MISTRAL 1', 'SAPEUR 1', `En ligne devant vous, rue du Temple. Vous pouvez revenir. Restez derrière mes boucliers, je vous couvre.`),
        voix('ÉQUIPIER', `Les pneus vont péter. On se met de trois quarts, pas dans l'axe.`),
      ], [`Un pneu éclate avec une détonation`, `Le feu repart sous le capot`]),
    ph('constat', `La vitre, le casque, le compte rendu`,
      `La voiture n'est plus qu'une carcasse fumante au milieu de la rue du Temple, et le groupe s'est dissous derrière la ligne. Il reste une vitre de cabine en miettes, un casque fendu, un collègue à faire examiner : tout cela se déclare, avec l'heure et le lieu.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte des dégâts sur l'engin et de l'état de l'équipage. Une plainte sera déposée pour les violences.`),
        voix('CHEF D\'AGRÈS', `Toi, tu montes dans l'ambulance, je ne veux pas discuter. Les autres : on roule les tuyaux.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Replier l\'engin et l\'équipe sans perte', 'survivre'),
    ob('o2', 'Revenir sous protection et éteindre le feu', 'eteindre', { target: 'voiture', count: 1 }),
    os('o3', 'Obtenir la protection en moins de cinq minutes', 'duree', { seconds: 300 }),
    os('o4', 'Ne pas répondre aux projectiles', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'L\'engin est incendié avant l\'arrivée de la protection.'), fail('joueur_hors_combat', 'Équipe blessée.')],
  randomEvents: ['Une vitre de l\'engin est brisée', 'Un collègue est touché', 'La ligne de CRS est en retard', 'Un feu repart'],
  unique: 'Les secours attaqués : le pompier découvre qu\'il n\'est pas intouchable.',
  tags: ['agression', 'protection'],
});

export const POMP_05 = mission({
  ...POMP, ...scene(CDT_11), difficulty: 4, chapter: 13, mirrorOf: CDT_11.id, altRoles: ['commandant'],
  id: 'pompier-05-les-deux-camps',
  title: 'Les deux camps',
  pitch: 'Un policier brûlé et un manifestant blessé à la tête au même moment : deux équipes, deux couloirs.',
  briefing: [
    `Place de la République, à l'heure des sommations. Un cocktail incendiaire brûle un policier, un pavé blesse un manifestant à la tête. Les deux sont à cinquante mètres l'un de l'autre, de chaque côté de la ligne. Votre fourgon de sapeurs-pompiers de Paris est à l'angle du boulevard.`,
    `Votre mission est de prendre en charge les deux victimes avec deux équipes et deux couloirs, sans qu'une des deux ne soit sacrifiée à l'autre. Chaque camp attend qu'on s'occupe d'abord des siens : vous ne choisissez pas.`,
    `Envoyez l'équipe un vers le policier, l'équipe deux vers le manifestant. Demandez deux couloirs. Éteignez la brûlure à l'eau, contrôlez l'hémorragie. Évacuez par deux ambulances.`,
    `Ne faites aucune différence entre les deux : un secouriste est neutre. Prévenez le commandement pour chaque couloir. Une victime non prise en quatre minutes est un échec.`,
  ],
  intel: intel(
    'Quatre cents personnes ; deux victimes à cinquante mètres.',
    'Trente individus déterminés près de la statue.', ['Place de la République', 'Boulevard du Temple'],
    ['Deux équipes, deux couloirs', 'Neutralité absolue', 'Quatre minutes maximum']),
  phases: [
    ph('deux-appels', `Deux appels, cinquante mètres d'écart`,
      `Dix-neuf heures, place de la République, à l'heure des sommations. Votre fourgon est à l'angle du boulevard du Temple. Deux appels tombent ensemble : un policier brûlé par un engin incendiaire, côté statue ; un manifestant blessé à la tête par un pavé, cinquante mètres plus loin, de l'autre côté de la ligne.`,
      T(40), [
        rad('CENTRAL', 'SAPEUR 1', `Deux victimes place de la République : UN agent brûlé derrière la ligne, UN manifestant blessé à la tête devant la ligne. Il vous faut deux couloirs.`),
        voix('CHEF D\'AGRÈS', `Deux équipes. La une sur le policier, la deux sur le manifestant. Le plus grave part le premier, c'est tout.`),
        voix('COMMANDANT', SOMMATIONS.premiere),
      ]),
    ph('deux-couloirs', `Deux couloirs à la fois`,
      `La première équipe atteint le policier en trente secondes : il est derrière les boucliers. Pour le manifestant, il faut que la ligne s'ouvre, et que ceux d'en face cessent de lancer le temps de passer. Refroidir la brûlure à l'eau, comprimer la plaie de la tête ; deux gestes, deux endroits de la place de la République, au même moment.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'SAPEUR 1', `Couloir ouvert pour votre seconde équipe, à gauche de la statue. Faites vite : la dernière sommation arrive.`),
        voix('MANIFESTANT', `Les pompiers ! Par ici ! Et dites aux flics de ne pas tirer pendant que vous êtes là !`),
      ], [`Un projectile tombe à dix mètres d'un pompier`, `Un camp réclame d'être secouru le premier`]),
    ph('ordre-de-gravite', `Par ordre de gravité`,
      `Les deux victimes sont entre vos mains. Une seule ambulance est là ; l'autre est bloquée par un fourgon de CRS boulevard Voltaire. Brûlure du cou, ou plaie du crâne avec perte de connaissance : celle qui part en premier est celle qui risque le plus, et autour de vous chaque camp regarde lequel vous choisissez.`,
      FOULE('dispersion'), [
        rad('SANTÉ 2', 'SAPEUR 1', `Bloqué boulevard Voltaire par un fourgon en travers. Je cherche un autre accès, TROIS minutes.`),
        voix('CRS', `C'est notre collègue, il part le premier, non ? Vous n'allez pas le faire attendre pour l'autre ?`),
      ], [`Une ambulance est bloquée`, `Un journaliste filme le choix de la première évacuation`]),
    ph('deux-departs', `Deux départs`,
      `La dispersion bat son plein sur la place de la République quand la seconde ambulance arrive enfin, par la rue du Faubourg du Temple. Les deux victimes quittent les lieux l'une après l'autre ; le fourgon se remet en attente à l'angle du boulevard du Temple, portes ouvertes.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte : heure de prise en charge de chaque victime, ordre des départs, motif de l'ordre.`),
        voix('CHEF D\'AGRÈS', `Si on nous demande pourquoi celui-là d'abord, on répond avec le bilan, pas avec l'uniforme.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Prendre en charge les deux victimes en moins de quatre minutes', 'secourir', { count: 2, seconds: 240 }),
    ob('o2', 'Évacuer les victimes par ordre de gravité, sans distinction de camp', 'personnalise', { target: 'tri_sans_distinction_de_camp' }),
    os('o3', 'Obtenir deux couloirs distincts', 'proteger_site', { target: 'couloir_secours', count: 2 }),
    os('o4', 'Rendre compte à chaque étape', 'personnalise', { target: 'compte_rendu', count: 3 }),
  ],
  failures: [fail('victime_non_secourue', 'Une des deux victimes n\'est pas prise en quatre minutes.', 240), fail('joueur_hors_combat', 'Équipe blessée.')],
  randomEvents: ['Un camp réclame d\'être soigné en premier', 'Un projectile touche un pompier', 'Une ambulance est bloquée', 'Un journaliste filme de près'],
  unique: 'Deux victimes, deux camps, une seule neutralité : le secouriste n\'est d\'aucun côté.',
  tags: ['neutralite', 'miroir'],
});

export const POMP_06 = mission({
  ...POMP, ...scene(CDT_09), difficulty: 2, chapter: 13, mirrorOf: CDT_09.id, altRoles: ['commandant'],
  id: 'pompier-06-quai-inonde',
  title: 'Quai inondé',
  pitch: 'La crue gagne le quai d\'Orsay : évacuer les riverains, porter secours à ceux que l\'eau menace.',
  briefing: [
    `Quai d'Orsay, la Seine a franchi la cote d'alerte. Les berges basses sont noyées, les voies sur berge fermées. Des riverains refusent d'évacuer des péniches amarrées. Les curieux se pressent au bord de l'eau. Vous êtes sapeur-pompier de Paris.`,
    `Votre mission est d'évacuer les riverains des péniches, d'écarter les curieux du bord de l'eau et de porter secours à toute personne tombée à l'eau. Les forces de l'ordre assurent le périmètre, vous assurez l'eau.`,
    `Embarquez dans le bateau de sauvetage. Évacuez deux péniches. Équipez-vous de gilets de sauvetage. Écartez les curieux. Gardez le couloir libre pour l'ambulance. Annoncez à la radio le niveau de l'eau.`,
    `L'eau monte de plusieurs centimètres par heure et le courant tend les amarres : n'attendez pas. Une personne à l'eau passe avant une péniche. Ne laissez pas un enfant près du bord.`,
  ],
  intel: intel(
    'Mille curieux, riverains inquiets ; la crue gagne les berges basses.',
    'Aucun radical.', ['Quai d\'Orsay', 'Pont de l\'Alma', 'Quai Branly'],
    ['Évacuer les péniches', 'Écarter les curieux', 'Annoncer le niveau de l\'eau']),
  phases: [
    ph('embarcation', `L'embarcation à l'eau`,
      `Neuf heures, quai d'Orsay, sous la pluie. La Seine a recouvert les berges basses et tire sur les amarres des péniches. Votre équipe met l'embarcation de sauvetage à l'eau depuis une rampe à moitié noyée ; au-dessus, derrière les parapets, des centaines de curieux regardent le courant.`,
      T(100), [
        rad('CENTRAL', 'SAPEUR 1', `Deux péniches à évacuer quai Branly, quatre personnes à bord. La police écarte les curieux et vous garde l'accès par la rue de l'Université.`),
        voix('CHEF D\'AGRÈS', `Gilets de sauvetage pour tout le monde, nous compris. Le courant est fort : on reste reliés à la berge par la ligne de vie.`),
      ], [`La rampe d'accès est glissante`]),
    ph('peniches', `Quatre personnes sur deux péniches`,
      `L'embarcation accoste la première péniche, quai Branly, dans le clapot. Un couple âgé attend sur le pont avec deux sacs ; sur la seconde, un homme refuse de quitter le bateau où il vit depuis trente ans, et son chien tourne en rond sur le plat-bord. Quatre personnes à faire passer, une par une, gilet attaché.`,
      OBJ('o1'), [
        voix('RIVERAIN', `Trente ans que je vis là-dessus ! Elle a tenu toutes les crues, je ne la laisse pas !`),
        rad('CENTAURE 1', 'SAPEUR 1', `Je suis sur la chaussée inondée du quai Branly. Je peux prendre vos évacués à mon bord dès que vous les déposez.`),
      ], [`Un riverain refuse de quitter sa péniche`, `Un chien tombe à l'eau`, `Une amarre lâche`]),
    ph('homme-a-l-eau', `Un homme à l'eau`,
      `Les quatre riverains sont à terre. Un cri au-dessus : sur la rampe du quai d'Orsay, un curieux descendu photographier a glissé et vient de partir dans le courant, vers le pont de l'Alma. Une personne à l'eau passe avant tout le reste : cap sur lui, bouée prête, par le plus court.`,
      OBJ('o2'), [
        rad('CENTRAL', 'SAPEUR 1', `URGENT. Homme à l'eau quai d'Orsay, il dérive vers le pont de l'Alma. Vous êtes la seule embarcation sur zone.`),
        voix('ÉQUIPIER', `Je le vois ! Trente mètres, il se débat. Je lance la bouée dès qu'on est à portée.`),
      ], [`Un curieux tombe dans la Seine`, `Le moteur de l'embarcation cale`]),
    ph('pic', `Le pic de la crue`,
      `L'homme est repêché, enveloppé dans une couverture, grelottant. L'eau gagne encore dix centimètres et atteint le haut du quai Branly ; un morceau de berge s'affaisse d'un coup. À la radio, on vous demande le niveau à chaque passage devant l'échelle du pont de l'Alma.`,
      T(240), [
        rad('CENTRAL', 'SAPEUR 1', `Annoncez-moi le niveau à l'échelle du pont de l'Alma à chaque passage. Le périmètre recule.`),
        rad('SANTÉ 1', 'SAPEUR 1', `Je prends votre repêché à la rampe du quai d'Orsay. Hypothermie ? Annoncez.`),
      ], [`Un morceau de quai s'effondre`, `Un enfant s'approche du bord`]),
    ph('decrue', `Le niveau baisse d'un doigt`,
      `Vers midi, le niveau stagne, puis baisse d'un doigt à l'échelle du pont de l'Alma. Les curieux se lassent. Votre embarcation fait une dernière ronde le long du quai Branly, vérifie les amarres, puis remonte la rampe : il faudra revenir demain, et le surlendemain.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Fin d'intervention sur l'eau. Rendez compte : évacués, repêché, état de l'embarcation.`),
        voix('RIVERAIN', `Je pourrai remonter à bord quand ? Vous me le direz, vous ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Évacuer les riverains des deux péniches', 'evacuer', { target: 'riverain', count: 4 }),
    ob('o2', 'Repêcher l\'homme tombé à l\'eau', 'secourir', { target: 'homme_a_l_eau', count: 1 }),
    os('o3', 'Écarter les curieux du bord de l\'eau', 'disperser', { place: 'Quai d\'Orsay' }),
    os('o4', 'Annoncer le niveau de l\'eau à la radio', 'personnalise', { target: 'niveau_eau', count: 3 }),
  ],
  failures: [fail('victime_non_secourue', 'Un homme à l\'eau n\'est pas repêché.'), fail('trop_de_blesses', 'Trop de victimes.', 4)],
  randomEvents: ['Un chien tombe à l\'eau', 'Panne du bateau', 'Un riverain refuse de partir', 'Effondrement d\'un morceau de quai'],
  unique: 'L\'eau comme adversaire : le pompier travaille avec son bateau, pas avec une lance.',
  tags: ['crue', 'bateau', 'miroir'],
});

export const POMP_07 = mission({
  ...POMP, ...scene(CDT_08), difficulty: 3, chapter: 13, mirrorOf: CDT_08.id, altRoles: ['commandant'],
  id: 'pompier-07-minuit-moins-dix',
  title: 'Minuit moins dix',
  pitch: 'Fin de fête sur les quais : malaises, chutes, une foule dense et des secours qui doivent passer.',
  briefing: [
    `Quai de Conti, fin de la Fête de la musique. Deux mille personnes restent sur les quais malgré la fermeture des débits. L'alcool et la chaleur multiplient les malaises. Un homme est tombé dans la Seine, une jeune femme est inconsciente. Vous êtes secouriste de la brigade des sapeurs-pompiers de Paris.`,
    `Votre mission est de traiter les malaises en moins de quatre minutes, de secourir l'homme tombé à l'eau et de garder libre l'accès des secours. Vous travaillez avec les forces de l'ordre : les couloirs dépendent d'elles.`,
    `Demandez un couloir de trois mètres cinquante. Déployez le brancard. Soignez la jeune femme : position latérale de sécurité. Envoyez le bateau pour l'homme à l'eau. Annoncez : « Malaise, quai de Conti. »`,
    `Une foule en fête ne s'écarte pas facilement : prenez la voix, pas la force. Surveillez la densité : elle peut provoquer des malaises en chaîne. Ne laissez jamais le brancard seul.`,
  ],
  intel: intel(
    'Deux mille fêtards, ambiance joyeuse devenant tendue après minuit.',
    'Aucun groupe organisé.', ['Quai de Conti', 'Pont Neuf', 'Quai des Grands Augustins'],
    ['Demander un couloir', 'Prévoir le bateau', 'Surveiller la densité']),
  phases: [
    ph('ronde', `La ronde le long du quai`,
      `Une heure du matin, quai de Conti. Deux mille personnes sur les quais et le pont des Arts, de la musique partout, des bouteilles par terre. Votre équipe marche le long du parapet avec un sac et un brancard pliant ; le fourgon est resté en haut, rue Dauphine, là où il peut encore manœuvrer.`,
      T(120), [
        rad('CENTRAL', 'SAPEUR 1', `Fin de soirée sur les quais. Réseau téléphonique saturé : vous n'aurez les appels que par radio. Premier malaise signalé près du pont des Arts.`),
        voix('CHEF D\'AGRÈS', `On reste ensemble. Le brancard ne reste jamais seul, et on ne s'enfonce pas dans le dense sans savoir par où ressortir.`),
      ], [`Le réseau téléphonique est saturé`]),
    ph('trois-malaises', `Trois malaises à contre-courant`,
      `Une jeune femme inconsciente au pied de l'escalier du quai de Conti, un homme pris de vomissements contre le parapet, un adolescent assis par terre qui ne sait plus où il est. Pour atteindre chacun, il faut remonter la foule à contre-courant, à la voix, brancard levé ; pour en ressortir, il faut qu'elle s'ouvre.`,
      OBJ('o1'), [
        voix('FÊTARD', `Hé, les pompiers ! Par là, elle est tombée d'un coup ! Poussez-vous, laissez-les passer !`),
        rad('MISTRAL 1', 'SAPEUR 1', `Je vous ouvre un couloir de TROIS mètres CINQ-ZÉRO jusqu'à l'escalier. Dites-moi quand vous ressortez.`),
      ], [`Un malaise survient dans la zone la plus dense`, `Un parent cherche son enfant dans la foule`, `Un pétard éclate près du brancard`]),
    ph('seine', `Un homme dans la Seine`,
      `Trois malaises pris en charge. Un cri, puis des dizaines de téléphones tournés vers l'eau : un fêtard est tombé du quai de Conti et s'accroche à un anneau d'amarrage, le courant dans les jambes. La vedette fluviale est à quatre minutes ; vous, vous êtes à dix mètres, avec une corde et une bouée.`,
      OBJ('o2'), [
        rad('CENTRAL', 'SAPEUR 1', `URGENT. Homme à l'eau quai de Conti. La vedette fluviale est à QUATRE minutes. Faites ce que vous pouvez depuis le quai.`),
        voix('ÉQUIPIER', `Il tient l'anneau ! Je lui lance la bouée, tu assures la corde. Personne ne saute !`),
      ], [`Un fêtard tombe dans la Seine`, `Des fêtards veulent sauter pour aider`]),
    ph('pont-neuf', `La barrière du Pont Neuf`,
      `L'homme est sur le quai, vivant, trempé. Au même moment, la foule reflue vers le Pont Neuf et se comprime contre une barrière, à l'entrée du pont : des personnes sont pressées contre le métal, d'autres tombent. C'est là qu'on vous appelle, avant même que quelqu'un ait eu le temps de crier.`,
      FOULE('dispersion'), [
        rad('ICARE', 'SAPEUR 1', `Compression à l'entrée du Pont Neuf, côté quai de Conti. Plusieurs personnes au sol contre la barrière.`),
        rad('MISTRAL 2', 'SAPEUR 1', `Je fais retirer la barrière. Il me faut vos équipes ici dans la minute.`),
      ], [`Des personnes sont pressées contre une barrière`, `Un camion de livraison bloque l'accès du fourgon`]),
    ph('fin-de-fete', `Ivresse, entorse, hypothermie`,
      `Les quais se vident vers le métro et la rue Dauphine. Restent ceux que la fête laisse derrière elle : une cheville tordue sur les pavés du quai de Conti, deux ivresses, un repêché qui grelotte sous une couverture. Pas une de ces victimes ne partira sans un bilan transmis.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Bilan par victime avant tout départ. Deux ambulances vous rejoignent rue Dauphine.`),
        voix('CHEF D\'AGRÈS', `On refait le tour du quai avant de plier. Celui qui dort sur un banc, on vérifie qu'il dort.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Traiter trois malaises en moins de quatre minutes chacun', 'soigner', { target: 'malaise', count: 3, seconds: 240 }),
    ob('o2', 'Repêcher l\'homme tombé à l\'eau', 'secourir', { target: 'homme_a_l_eau', count: 1 }),
    os('o3', 'Garder un couloir libre aux secours', 'proteger_site', { target: 'couloir_secours' }),
    os('o4', 'Ne laisser aucune victime sans bilan', 'personnalise', { target: 'bilan_radio', count: 3 }),
  ],
  failures: [fail('victime_non_secourue', 'Une victime n\'est pas secourue à temps.'), fail('trop_de_blesses', 'Mouvement de foule grave.', 8)],
  randomEvents: ['Un malaise dans la foule dense', 'Un camion bloque l\'accès', 'Chute d\'un fêtard sur le quai', 'Panne de radio'],
  unique: 'Les secours de la fête : le pompier est le premier à voir les limites de la foule.',
  tags: ['fete', 'quais', 'miroir'],
});

export const POMP_08 = mission({
  ...POMP, ...scene(CRS_09), difficulty: 2, chapter: 13, mirrorOf: CRS_09.id, altRoles: ['crs'],
  id: 'pompier-08-couloir-de-vie',
  title: 'Deux cents mètres de foule',
  pitch: 'Un feu au premier étage, une rue pleine de monde et un engin arrêté à deux cents mètres : rien ne s\'éteint tant que les gardiens n\'ont pas ouvert le couloir.',
  briefing: [
    `Rue Saint-Antoine, un feu s'est déclaré au premier étage d'un immeuble pendant un rassemblement. La foule, curieuse, bloque la chaussée. Votre fourgon est arrêté à deux cents mètres et ne peut pas avancer. Des gardiens de la paix tentent de dégager la rue.`,
    `Votre mission est d'atteindre l'immeuble avec l'engin, d'attaquer le feu à la lance, d'évacuer les riverains par l'escalier, ou par l'échelle si la cage est enfumée, et de sécuriser la zone. Votre rôle est de travailler vite dans un couloir étroit.`,
    `Suivez les agents qui ouvrent le couloir. Dressez l'échelle. Attaquez le feu par l'extérieur. Évacuez les riverains par l'escalier. Rendez compte à la radio. Ne laissez pas la foule se rapprocher.`,
    `Un couloir de trois mètres cinquante suffit à peine : conduisez avec prudence. Un badaud qui s'avance est un danger. La priorité est la vie des habitants.`,
  ],
  intel: intel(
    'Trois cents curieux autour d\'un immeuble en feu.',
    'Aucun radical.', ['Rue Saint-Antoine'],
    ['Suivre les agents', 'Dresser l\'échelle', 'Évacuer par l\'escalier']),
  phases: [
    ph('deux-cents-metres', `Pare-chocs contre la foule`,
      `Quinze heures, rue Saint-Antoine. Votre fourgon est arrêté à deux cents mètres de l'immeuble qui fume, pare-chocs contre une foule de curieux qui filment le premier étage. Devant vous, six gardiens de la paix écartent les gens à la voix ; le deux-tons ne sert plus à rien, tout le monde l'a entendu, personne ne bouge.`,
      T(100), [
        rad('MISTRAL 1', 'SAPEUR 1', `J'ouvre un couloir de TROIS mètres CINQ-ZÉRO jusqu'à la façade. Avancez au pas derrière mes agents.`),
        voix('CHEF D\'AGRÈS', `Au pas, et tu regardes tes rétroviseurs. Un badaud sous une roue, et on n'éteindra rien du tout.`),
      ], [`Un curieux se plante au milieu du couloir`]),
    ph('mise-en-station', `L'échelle contre la façade`,
      `Le fourgon avance mètre par mètre dans le couloir ouvert par les agents, rétroviseurs rabattus. Au pied de l'immeuble de la rue Saint-Antoine : cales, stabilisateurs, échelle. La bouche d'incendie la plus proche est sous une voiture mal garée ; il faut une autre prise d'eau, et vite.`,
      OBJ('o1'), [
        voix('ÉQUIPIER', `La bouche est sous la berline grise ! Je tire une ligne depuis celle du carrefour, cinquante mètres de plus.`),
        voix('RIVERAINE', `Il y a ma voisine au deuxième ! Elle a quatre-vingts ans, elle ne descend plus les escaliers !`),
      ], [`La bouche d'incendie est masquée par une voiture`, `Une bouteille de gaz est signalée au premier étage`]),
    ph('escalier', `Quatre riverains à faire descendre`,
      `La lance attaque le feu par la fenêtre du premier étage. Dans la cage d'escalier, la fumée descend ; quatre riverains sont à sortir, dont une femme âgée au deuxième. Les agents les prennent au bas des marches, dans la rue Saint-Antoine, et les éloignent du couloir.`,
      OBJ('o2'), [
        voix('CHEF D\'AGRÈS', `Binôme d'exploration : deuxième étage, la dame âgée d'abord. Chaise portoir.`),
        rad('MISTRAL 1', 'SAPEUR 1', `Mes agents sont au pied de l'escalier. On prend vos évacués et on les emmène vers la Bastille.`),
      ], [`Une personne âgée est bloquée au deuxième étage`, `Un riverain veut remonter chercher ses papiers`]),
    ph('tuyaux', `Les curieux sur les tuyaux`,
      `Les quatre riverains sont dehors. Le feu recule, mais la rue Saint-Antoine se referme : les curieux reviennent, enjambent les tuyaux, se penchent pour voir. Un tuyau écrasé, c'est une lance sans pression au premier étage ; le couloir doit tenir jusqu'à la dernière braise.`,
      T(200), [
        voix('ÉQUIPIER', `Pression qui chute ! Quelqu'un marche sur la ligne !`),
        rad('MISTRAL 1', 'SAPEUR 1', `Je repousse les curieux derrière vos tuyaux. Dites-moi combien de temps il vous faut encore.`),
      ], [`Un tuyau est écrasé par des curieux`, `Un chat s'est réfugié sur le toit`]),
    ph('deblai', `Le déblai`,
      `Plus de flammes à la fenêtre du premier étage, seulement de la vapeur. On déblaie, on dégarnit, on vérifie le plancher du dessus. Dans la rue Saint-Antoine, les agents rouvrent une voie ; le fourgon repartira par où il est venu, dans une rue redevenue large.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte : feu, victimes, relogement à prévoir. La police rouvre la rue derrière vous.`),
        voix('CHEF D\'AGRÈS', `Deux cents mètres de foule, c'est ce qui nous a coûté le plus cher aujourd'hui. Note-le dans le compte rendu.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Atteindre l\'immeuble et attaquer le feu', 'eteindre', { place: 'Rue Saint-Antoine', target: 'immeuble', count: 1 }),
    ob('o2', 'Évacuer les riverains par l\'escalier', 'evacuer', { target: 'riverain', count: 4 }),
    os('o3', 'Ne heurter aucun badaud avec l\'engin', 'personnalise', { target: 'badaud_heurte', max: 0 }),
    os('o4', 'Garder le couloir libre jusqu\'à la fin', 'duree', { seconds: 600 }),
  ],
  failures: [fail('victime_non_secourue', 'Un riverain n\'est pas évacué à temps.'), fail('bavure_grave', 'Un badaud est heurté par l\'engin.')],
  randomEvents: ['Un curieux se plante au milieu du couloir', 'Une personne âgée est coincée au deuxième étage', 'Une bouteille de gaz est signalée au premier étage', 'La bouche d\'incendie la plus proche est masquée par une voiture'],
  unique: 'La même scène vue d\'un fourgon : on mesure ce que coûte une rue encombrée.',
  tags: ['feu', 'miroir'],
});

export const POMP_09 = mission({
  ...POMP, type: 'protection_secours', difficulty: 3, chapter: 13,
  id: 'pompier-09-voiture-en-feu',
  title: 'Voiture en feu',
  pitch: 'Une voiture embrasée en travers de l\'avenue : un extincteur ne suffit pas, il faut l\'engin et la lance.',
  briefing: [
    `Avenue de la République, soir de manifestation. Une voiture a été retournée et incendiée en travers de la chaussée. Les flammes montent à quatre mètres. Un scooter brûle à côté. Les agents tentent d'éteindre à l'extincteur sans succès.`,
    `Votre mission est d'éteindre la voiture avec la lance, de refroidir les alentours et d'empêcher le feu de gagner un véhicule voisin. Vous avez besoin de trois minutes et d'une protection.`,
    `Positionnez l'engin à vingt mètres. Déroulez la lance. Éteignez la voiture en jet diffus. Refroidissez le scooter. Surveillez les pneus : ils éclatent. Gardez les curieux à quarante mètres.`,
    `Une voiture embrasée n'est pas éteignable par extincteur. Ne vous approchez pas d'un véhicule en feu par l'avant. Un pneu qui éclate peut blesser à quinze mètres.`,
  ],
  place: 'Avenue de la République', timeOfDay: 21.5, weather: 'couvert', windFrom: 250, windSpeed: 2,
  crowd: crowd(300, '', 0.45, 0.55, 0.2, { curieux: 0.5, black_bloc: 0.2, fetards: 0.3 },
    ['Avenue de la République', 'Place de la République'], 0.2),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 2, samu: 1 }),
  intel: intel(
    'Trois cents personnes ; une voiture et un scooter en feu.',
    'Une trentaine d\'individus déterminés.', ['Avenue de la République'],
    ['Placer l\'engin à vingt mètres', 'Surveiller les pneus', 'Écarter les curieux']),
  phases: [
    ph('attaque', `Quatre mètres de flammes`,
      `Vingt et une heures trente, avenue de la République. Une voiture retournée brûle en travers de la chaussée, flammes à quatre mètres ; deux gardiens de la paix ont vidé leurs extincteurs dessus, sans effet. L'engin se place à vingt mètres, jamais dans l'axe : lance en jet diffusé, attaque de trois quarts arrière, l'habitacle d'abord, le moteur ensuite.`,
      OBJ('o1'), [
        rad('CENTRAL', 'SAPEUR 1', `Feu de véhicule avenue de la République. Une unité de police est sur place et tient les curieux.`),
        voix('CRS', `On a vidé deux extincteurs, ça n'a rien fait ! C'est à vous !`),
        voix('CHEF D\'AGRÈS', `De trois quarts arrière ! Jamais par l'avant : si un vérin de pare-chocs part, il traverse une jambe.`),
        voix('ÉQUIPIER', `Pneu !… Deuxième pneu ! Il en reste deux.`),
        // premier aléa : il allume le foyer que la phase attend (aleas.ts, « flammes ») ; sans lui, aucun feu avant
        // la fin de phase forcée (5 min)
      ], [`Un pneu éclate et les flammes repartent sous la voiture`, `Les curieux se rapprochent à moins de vingt mètres`, `Un projectile est lancé sur l'engin`]),
    ph('scooter', `Le scooter et la voiture d'à côté`,
      `La voiture ne flambe plus. Le scooter couché près d'elle, lui, a pris : réservoir, selle, carénage, et la chaleur cloque déjà la peinture d'une voiture en stationnement de l'avenue de la République, à deux mètres. Refroidir, écarter, surveiller ; un feu de véhicule se propage par ce qu'on a oublié de mouiller.`,
      T(180), [
        rad('MISTRAL 2', 'SAPEUR 1', `Je garde les curieux à QUATRE-ZÉRO mètres. Un autre départ de feu est signalé plus haut sur l'avenue.`),
        voix('CHEF D\'AGRÈS', `Mouille la voiture d'à côté avant qu'elle prenne. Le scooter ensuite.`),
      ], [`Le feu menace une voiture en stationnement`, `Un autre départ de feu est signalé`]),
    ph('carcasse', `La carcasse et le bitume noirci`,
      `Il reste une carcasse noire, un scooter fondu et une tache de bitume cloqué au milieu de l'avenue de la République. On noie les points chauds, on débranche ce qui reste de batterie. Les agents regardent leurs extincteurs vides : la prochaine fois, ils appelleront plus tôt.`,
      FIN, [
        rad('CENTRAL', 'SAPEUR 1', `Rendez compte en fin d'extinction. Enlèvement de la carcasse demandé à la voirie.`),
        voix('CRS', `On pensait que deux extincteurs suffiraient. C'est noté pour la prochaine fois.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éteindre la voiture embrasée', 'eteindre', { target: 'voiture', count: 1 }),
    ob('o2', 'Empêcher le feu de gagner un autre véhicule', 'limiter_degats', { max: 0 }),
    os('o3', 'Garder les curieux à quarante mètres', 'proteger_site', { target: 'perimetre_de_securite', count: 40 }),
    os('o4', 'Ne blesser aucun pompier', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('personnalise', 'Le feu gagne un autre véhicule.'), fail('joueur_hors_combat', 'Pompier blessé.')],
  randomEvents: ['Un pneu éclate', 'Les curieux se rapprochent', 'Un jet de projectile sur l\'engin', 'Un autre départ de feu'],
  unique: 'Un extincteur ne suffit pas : on apprend la différence entre un petit feu et un feu de véhicule.',
  tags: ['feu', 'voiture'],
});

export const POMPIER: MissionDef[] = [
  POMP_01, POMP_02, POMP_03, POMP_04, POMP_05, POMP_06, POMP_07, POMP_08, POMP_09,
];
