/* =====================================================================================
 * Catalogue — secouriste : sapeur-pompier de Paris (fourgon, lance, extincteur, secours à victime).
 * Il dépend de la protection des forces de l'ordre pour travailler. Rôle civil de la carrière :
 * ses missions s'ouvrent quand leur mission miroir est terminée.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
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
    ph('alerte', 'Alerte', 'Vous apprenez qu\'une victime est à terre.', T(60),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Victime à terre, avenue de l\'Opéra. Demande un couloir. PARLEZ.']], []),
    ph('couloir', 'Couloir', 'Les forces de l\'ordre ouvrent un couloir de trois mètres cinquante.', T(180),
      [['MISTRAL 1', 'SANTÉ UN ICI MISTRAL UN. Couloir pour SANTÉ UN, axe véhicules, largeur TROIS mètres CINQ-ZÉRO. TERMINÉ.']], ['Un projectile tombe à dix mètres']),
    ph('extraction', 'Extraction', 'Vous atteignez la victime et l\'évacuez.', TENS(0.65),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Victime sur brancard, retour. PARLEZ.']], []),
    ph('fin', 'Retour', 'Vous revenez à l\'engin.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Victime évacuée. PARLEZ.']], []),
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
    ph('alerte', 'Alerte', 'La poubelle brûle contre la façade.', T(60),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Départ pour feu de façade, boulevard Saint-Germain. PARLEZ.']], []),
    ph('extinction', 'Extinction', 'Vous attaquez la base des flammes.', T(180),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Feu attaqué, lance en place. PARLEZ.']], ['Une fenêtre éclate']),
    ph('evacuation', 'Évacuation', 'Vous montez chercher les deux habitants.', TENS(0.4),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. DEUX personnes évacuées. PARLEZ.']], []),
    ph('fin', 'Reconnaissance', 'Vous inspectez le bâtiment.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Feu éteint, bâtiment sain. PARLEZ.']], []),
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
    ph('arrivee', 'Arrivée des victimes', 'Douze victimes sont amenées au poste.', T(120),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. UN-DEUX victimes, poste avancé en place. PARLEZ.']], []),
    ph('tri', 'Tri', 'Vous triez par couleur.', T(300),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Tri : QUATRE rouges, QUATRE jaunes, QUATRE verts. PARLEZ.']], ['Un vert s\'aggrave']),
    ph('evacuation', 'Évacuations', 'Les ambulances arrivent une à une.', TENS(0.35),
      [['CENTRAL', 'SANTÉ UN ICI CENTRAL. Première ambulance à DEUX minutes. PARLEZ.']], []),
    ph('fin', 'Fin', 'Toutes les victimes sont évacuées.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Poste vidé. PARLEZ.']], []),
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
    ph('extinction', 'Extinction', 'Vous attaquez le feu de voiture.', T(90),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Feu de voiture attaqué, rue du Temple. PARLEZ.']], []),
    ph('projectiles', 'Projectiles', 'Un groupe lance des projectiles sur l\'engin.', TENS(0.7),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. URGENT. Pris à partie, demande protection. PARLEZ.']], ['Une vitre de l\'engin est brisée']),
    ph('repli', 'Repli', 'Vous reculez avec l\'engin.', FOULE('dispersion'),
      [['MISTRAL 1', 'SANTÉ UN ICI MISTRAL UN. Protection en route, TROIS minutes. PARLEZ.']], []),
    ph('retour', 'Retour sous protection', 'Vous revenez derrière la ligne de CRS.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. De retour, feu éteint. PARLEZ.']], []),
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
    ph('alerte', 'Alerte', 'Deux victimes sont signalées.', T(60),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. DEUX victimes, UN policier brûlé, UN manifestant blessé à la tête. Demande deux couloirs. PARLEZ.']], []),
    ph('couloirs', 'Couloirs', 'Les forces de l\'ordre ouvrent deux couloirs.', T(180),
      [['MISTRAL 1', 'SANTÉ UN ICI MISTRAL UN. Couloir pour SANTÉ UN, axe véhicules, largeur TROIS mètres CINQ-ZÉRO. TERMINÉ.']], ['Un projectile tombe à dix mètres']),
    ph('soins', 'Soins', 'Vous soignez les deux victimes.', TENS(0.55),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Brûlure refroidie, hémorragie contrôlée. PARLEZ.']], []),
    ph('fin', 'Évacuation', 'Les deux victimes sont évacuées.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Deux victimes évacuées. PARLEZ.']], []),
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
    ph('alerte', 'Alerte', 'La crue gagne les berges.', T(120),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Départ bateau de sauvetage, quai d\'Orsay. PARLEZ.']], []),
    ph('evacuation', 'Évacuation des péniches', 'Vous évacuez deux péniches.', T(360),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Première péniche évacuée, DEUX riverains. PARLEZ.']], ['Un chien tombe à l\'eau']),
    ph('pic', 'Pic de la crue', 'Un curieux tombe à l\'eau.', TENS(0.3),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. URGENT. UN homme à l\'eau, pont de l\'Alma. PARLEZ.']], []),
    ph('fin', 'Décrue', 'Le niveau stagne puis baisse.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Évacuation terminée. PARLEZ.']], []),
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
    ph('malaises', 'Premiers malaises', 'Plusieurs malaises sont signalés.', T(180),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Malaise, quai de Conti. PARLEZ.']], []),
    ph('eau', 'Homme à l\'eau', 'Un fêtard tombe dans la Seine.', T(420),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. URGENT. UN homme à l\'eau, pont Neuf. PARLEZ.']], ['Un malaise dans la foule dense']),
    ph('densite', 'Compression', 'La foule se serre sur le pont.', TENS(0.5),
      [['ICARE', 'SANTÉ UN ICI ICARE. Densité critique sur le pont Neuf. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les quais se vident.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Quais libres. PARLEZ.']], []),
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
    ph('route', 'Approche', 'Vous suivez les agents dans la rue encombrée.', T(120),
      [['MISTRAL 1', 'SANTÉ UN ICI MISTRAL UN. Couloir ouvert dans l\'axe de la rue, largeur TROIS mètres CINQ-ZÉRO. Avancez au pas, nous tenons les bords. PARLEZ.']], []),
    ph('attaque', 'Attaque du feu', 'Vous attaquez le feu à la lance.', T(300),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Feu attaqué, premier étage. PARLEZ.']], ['Une personne âgée est coincée à l\'étage']),
    ph('evacuation', 'Évacuation', 'Vous évacuez les habitants.', FOULE('dispersion'),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. DEUX riverains évacués. PARLEZ.']], []),
    ph('fin', 'Extinction', 'Le feu est éteint.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Feu éteint. PARLEZ.']], []),
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
    ph('alerte', 'Alerte', 'La voiture est embrasée.', T(60),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Voiture embrasée, avenue de la République. PARLEZ.']], []),
    ph('extinction', 'Extinction', 'Vous attaquez la voiture à la lance.', T(240),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Voiture attaquée en jet diffus. PARLEZ.']], ['Un pneu éclate']),
    ph('refroidissement', 'Refroidissement', 'Vous refroidissez le scooter.', TENS(0.55),
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Scooter refroidi. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les feux sont éteints.', FIN, [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Voiture éteinte. PARLEZ.']], []),
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
