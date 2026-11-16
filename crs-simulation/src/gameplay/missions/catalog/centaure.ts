/* =====================================================================================
 * Catalogue — équipage du Centaure (gendarmerie mobile) : pilote, opérateur, chef d'engin.
 * Détachement facultatif de la carrière (chapitre 12) ; indicatifs « ÉPERVIER » et « CENTAURE ».
 * Le Centaure dégage et pousse (lame) et lance des grenades ; c'est le canon à eau qui éteint.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';
import { CRS_12 } from './crs';

const PILOTE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'gendarme_centaure', rank: null, poste: 'conducteur' };
const OPERATEUR: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'gendarme_centaure', rank: null, poste: 'operateur' };
const CHEF: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'gendarme_centaure', rank: null, poste: 'chef_groupe' };

export const CENT_01 = mission({
  ...PILOTE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 12,
  id: 'centaure-01-quatorze-tonnes-et-demie',
  title: 'Quatorze tonnes et demie',
  pitch: 'Apprendre à conduire un blindé de quatorze tonnes et demie : virage, marche arrière, poussée à la lame.',
  briefing: [
    `Place de Varsovie, un matin de brume. L'escadron de gendarmerie mobile vous prête un Centaure d'entraînement pour votre première conduite. Des plots et une barrière de chantier marquent le parcours. Il n'y a pas de foule.`,
    `Votre mission est de conduire le véhicule sur un parcours de cônes, d'effectuer une marche arrière jusqu'à un repère, de pousser une barrière à la lame et de vous arrêter à dix mètres d'un obstacle. Vous êtes pilote.`,
    `Mettez la ceinture, démarrez à l'ordre. Le véhicule est large de près de trois mètres et haut de presque quatre : gardez vos distances des murs et des branches. Poussez la barrière à cinq kilomètres-heure. Vérifiez par radio qu'il n'y a personne derrière avant de pousser.`,
    `Ne dépassez jamais six kilomètres-heure à proximité de piétons. Un obstacle ne se pousse jamais sans vérification : cela peut être une personne.`,
  ],
  place: 'Place de Varsovie', timeOfDay: 9, weather: 'brouillard', windFrom: 260, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ centaure: 1, pelotons: 1 }),
  intel: intel('Parcours de cônes, aucune foule.', 'Aucun signalement.', ['Place de Varsovie'],
    ['Garder trois mètres des murs', 'Vérifier avant de pousser', 'Rouler à moins de dix kilomètres-heure']),
  phases: [
    ph('conduite', 'Parcours de cônes', 'Vous suivez le parcours au pas.', T(60),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Suivez le parcours, dix kilomètres-heure maximum. PARLEZ.']], []),
    ph('marche-arriere', 'Marche arrière', 'Vous reculez jusqu\'au repère.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Marche arrière, repère à UN-CINQ mètres. PARLEZ.']], ['Un cône s\'effondre']),
    ph('poussee', 'Poussée de barrière', 'Vous poussez la barrière après vérification.', FIN,
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Obstacle vérifié, personne derrière. APERÇU. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Suivre le parcours sans toucher un seul cône', 'personnalise', { target: 'parcours_cones', count: 10 }),
    ob('o2', 'Vérifier l\'obstacle avant de pousser la barrière', 'degager_barricade', { target: 'barriere', count: 1 }),
    os('o3', 'S\'arrêter à dix mètres de l\'obstacle', 'personnalise', { target: 'arret_precis' }),
  ],
  failures: [fail('bavure_grave', 'Poussée sans vérification.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Un cône s\'effondre', 'Le moniteur place un mannequin derrière la barrière'],
  unique: 'La première règle du Centaure : vérifier avant de pousser.',
  tags: ['formation', 'blinde'],
});

export const CENT_02 = mission({
  ...PILOTE, type: 'protection_secours', difficulty: 3, chapter: 12,
  id: 'centaure-02-la-barricade-de-la-rue-royale',
  title: 'La barricade de la rue Royale',
  pitch: 'Une barricade de vélos et de poubelles enflammées bloque la rue Royale : ouvrir un passage aux pompiers à la lame.',
  briefing: [
    `Rue Royale, une barricade enflammée de huit mètres de large bloque la rue : poubelles, barrières, trottinettes électriques. Derrière elle, un immeuble fume. Les pompiers ne peuvent pas passer. Des projectiles tombent sur vous.`,
    `Votre mission est de dégager la barricade à la lame pour ouvrir un passage aux pompiers, de vérifier qu'il n'y a personne derrière, et de protéger l'équipage et les gendarmes à pied pendant l'opération. Vous êtes pilote.`,
    `Avancez à cinq kilomètres-heure. Arrêtez-vous à dix mètres. L'opérateur vérifie. Poussez en deux temps pour diviser les foyers. Les gendarmes progressent à pied derrière vous. Ne reculez jamais sans visibilité.`,
    `Une barricade en feu se divise en deux à quatre foyers quand on la pousse : les pompiers éteignent. Ne roulez pas dans le feu avec les gendarmes derrière. Les batteries des trottinettes s'embrasent violemment et projettent des étincelles à trois mètres.`,
  ],
  place: 'Rue Royale', timeOfDay: 19, weather: 'clair', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, '', 0.55, 0.65, 0.2, { black_bloc: 0.3, curieux: 0.4, gilets_jaunes: 0.3 },
    ['Rue Royale', 'Place de la Madeleine'], 0.2),
  forces: forces({ centaure: 1, pelotons: 1, pompiers: 3, samu: 1 }),
  intel: intel(
    'Trois cents personnes autour d\'une barricade.',
    'Une soixantaine d\'individus lancent des projectiles.', ['Rue Royale', 'Place de la Madeleine'],
    ['Vérifier avant de pousser', 'Protéger les gendarmes à pied', 'Appeler les pompiers après la poussée']),
  phases: [
    ph('approche', 'Approche', 'Vous avancez à cinq kilomètres-heure.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Vérifiez l\'obstacle, puis dégagez la barricade. PARLEZ.']], []),
    ph('verification', 'Vérification', 'L\'opérateur contrôle derrière la barricade.', T(240),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Obstacle vérifié, personne derrière. APERÇU. TERMINÉ.']], ['Une batterie explose sous la lame']),
    ph('poussee', 'Poussée', 'Vous divisez la barricade en deux foyers.', TENS(0.65),
      [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. Prêts à intervenir après la poussée. PARLEZ.']], []),
    ph('fin', 'Passage ouvert', 'Les pompiers passent.', FIN, [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. Passage reçu. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Dégager la barricade et ouvrir un passage aux pompiers', 'degager_barricade', { place: 'Rue Royale' }),
    ob('o2', 'Vérifier l\'absence de personne derrière avant de pousser', 'personnalise', { target: 'verification' }),
    os('o3', 'Ne laisser aucun gendarme à pied être blessé pendant la poussée', 'limiter_blesses', { target: 'gendarme', max: 0 }),
    os('o4', 'Ne pas laisser un foyer repartir', 'personnalise', { target: 'foyer_rallume', max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Une personne est heurtée par la lame.'), fail('joueur_hors_combat', 'Équipage en difficulté.')],
  randomEvents: ['Une batterie explose', 'Un manifestant monte sur la lame', 'Un jet de cocktail sur le blindé', 'Un pompier demande à passer'],
  unique: 'La lame du Centaure ouvre ce que les boucliers ne peuvent pas.',
  tags: ['barricade', 'lame'],
});

export const CENT_03 = mission({
  ...PILOTE, type: 'protection_secours', difficulty: 3, chapter: 12,
  id: 'centaure-03-la-lame',
  title: 'La lame',
  pitch: 'Trois barricades à dégager sur le boulevard de Strasbourg, dont une en feu, pour ouvrir l\'axe aux pompiers.',
  briefing: [
    `Boulevard de Strasbourg, nuit tombante. Trois barricades successives barrent l'axe : l'une de poubelles, l'autre de palettes, la troisième de vélos électriques et d'une voiture. La dernière brûle. Les pompiers attendent au bout du boulevard.`,
    `Votre mission est de dégager les trois barricades successivement, avec la lame, pour ouvrir l'axe. Vous êtes pilote : l'opérateur et le chef d'engin vous guident. Vous ne poussez jamais sans vérification.`,
    `Première barricade : poussée directe. Deuxième : approche lente, vérification. Troisième : après vérification, poussée en deux temps, pour diviser le feu. Entre chaque, reculez de dix mètres. Les gendarmes suivent.`,
    `Une barricade en feu est dangereuse pour le blindé : ne laissez pas de flamme contre un flanc. Les batteries de vélos s'embrasent : ne vous arrêtez pas dessus.`,
  ],
  place: 'Boulevard de Strasbourg', timeOfDay: 21, weather: 'couvert', windFrom: 240, windSpeed: 3,
  crowd: crowd(250, '', 0.55, 0.7, 0.25, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Boulevard de Strasbourg', 'Boulevard de Magenta'], 0.15),
  forces: forces({ centaure: 1, pelotons: 1, pompiers: 3, samu: 1 }),
  intel: intel(
    'Deux cent cinquante personnes ; trois barricades successives.',
    'Une centaine d\'individus déterminés.', ['Boulevard de Strasbourg'],
    ['Pousser en deux temps pour la barricade enflammée', 'Vérifier chaque obstacle', 'Garder les pompiers en retrait']),
  phases: [
    ph('premiere', 'Première barricade', 'Poussée directe sur les poubelles.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Première barricade, dégagez. PARLEZ.']], []),
    ph('deuxieme', 'Deuxième barricade', 'Palettes, vérification obligatoire.', T(300),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Obstacle vérifié. APERÇU. TERMINÉ.']], ['Un manifestant se cache derrière les palettes']),
    ph('troisieme', 'Troisième barricade en feu', 'Voiture et vélos électriques en feu.', TENS(0.6),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Poussée en deux temps, puis laissez les pompiers. PARLEZ.']], ['Étincelles de batteries sur le flanc du blindé']),
    ph('fin', 'Axe ouvert', 'Les pompiers passent.', FIN, [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. Axe ouvert. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Dégager les trois barricades', 'degager_barricade', { place: 'Boulevard de Strasbourg', count: 3 }),
    ob('o2', 'Vérifier chaque obstacle avant poussée', 'personnalise', { target: 'verification', count: 3 }),
    os('o3', 'Laisser les pompiers éteindre la barricade en feu', 'proteger_site', { target: 'pompiers' }),
    os('o4', 'Ne laisser aucune flamme contre un flanc', 'personnalise', { target: 'flamme_contre_blinde', max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Poussée non vérifiée sur une barricade.'), fail('temps', 'Axe non ouvert en dix minutes.', 600)],
  randomEvents: ['Un manifestant caché derrière les palettes', 'Étincelles de batteries', 'Une explosion de pneu', 'Une panne de chenille'],
  unique: 'Trois barricades, trois matériaux : on apprend ce que chacune demande.',
  tags: ['barricade', 'lame'],
});

export const CENT_04 = mission({
  ...OPERATEUR, type: 'manifestation_interdite', difficulty: 4, chapter: 12,
  id: 'centaure-04-une-salve-pas-trente',
  title: 'Une salve, pas trente',
  pitch: 'Repousser deux cents violents avec le moins de salves possible, vent de travers, sans gazer le cortège pacifique voisin.',
  briefing: [
    `Place Charles-de-Gaulle, manifestation interdite. Deux cents individus violents attaquent la ligne depuis l'avenue de la Grande-Armée. À cent cinquante mètres sur l'avenue Foch, un cortège pacifique de trois cents personnes attend. Le vent d'ouest souffle de travers.`,
    `Vous êtes opérateur : votre mission est de repousser les violents avec le moins de salves possible, d'éviter tout gaz sur le cortège pacifique et de respecter le plafond fixé par votre chef d'engin : douze grenades.`,
    `À l'ordre, lancez une salve de quatre grenades en tir courbe sur la zone désignée. Annoncez « Tir ! ». Regardez le nuage. Si le vent le pousse vers l'avenue Foch, suspendez. Le chef décide : vous exécutez. Le pilote garde l'engin en retrait.`,
    `Un tir tendu est une faute grave pour tout l'équipage. Le lance-grenades compte trente tubes et peut tous les vider d'un coup : c'est justement ce qu'on vous demande de ne pas faire. Chaque salve doit être justifiée par une violence constatée et annoncée au chef avant le tir.`,
  ],
  place: 'Place Charles de Gaulle', timeOfDay: 17, weather: 'nuageux', windFrom: 270, windSpeed: 5,
  crowd: crowd(600, 'libertes', 0.55, 0.7, 0.3, { gilets_jaunes: 0.3, black_bloc: 0.3, militants: 0.2, familles: 0.1, curieux: 0.1 },
    ['Avenue de la Grande Armée', 'Place Charles de Gaulle', 'Avenue Foch'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, centaure: 1, pelotons: 1, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six cents personnes ; deux cents violents d\'un côté, trois cents pacifiques de l\'autre.',
    'Deux cents individus déterminés avec protections.', ['Avenue de la Grande Armée', 'Avenue Foch'],
    ['Surveiller le vent', 'Compter les grenades', 'Désigner des zones précises']),
  phases: [
    ph('attaque', 'Attaque sur la ligne', 'Les violents attaquent la ligne.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Salve de QUATRE, zone carrefour Grande-Armée, tir courbe. FAITES L\'APERÇU.']], []),
    ph('salve', 'Première salve', 'Vous lancez et regardez le nuage.', T(300),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Salve tirée, vent de travers. PARLEZ.']], ['Le nuage dérive vers l\'avenue Foch']),
    ph('suspension', 'Suspension', 'Vous suspendez le tir si le nuage menace le cortège.', TENS(0.6),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Halte au feu, vent tournant. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les violents se replient.', FIN, [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Halte au feu, ils refluent. Rendez compte de votre consommation. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Repousser les violents avec douze grenades au plus', 'disperser', { place: 'Place Charles de Gaulle', max: 12 }),
    ob('o2', 'Ne causer aucun gaz sur le cortège pacifique', 'zero_bavure'),
    os('o3', 'Suspendre le tir au premier retour de vent', 'personnalise', { target: 'suspension_vent' }),
    os('o4', 'Rendre compte de la consommation', 'personnalise', { target: 'consommation' }),
  ],
  failures: [fail('bavure_grave', 'Gaz sur le cortège pacifique.'), fail('personnalise', 'Plus de douze grenades tirées : plafond dépassé.', 12)],
  randomEvents: ['Retour de gaz par vent tournant', 'Un enfant dans le nuage', 'Un lanceur s\'enraye', 'Un journaliste entre dans la zone'],
  unique: 'La sobriété est la compétence : chaque salve compte et chaque nuage se paie.',
  tags: ['salve', 'vent'],
});

export const CENT_05 = mission({
  ...PILOTE, ...scene(CRS_12), forces: forces({ ...CRS_12.forces, centaure: 1, pelotons: 1 }), difficulty: 3, chapter: 12, mirrorOf: CRS_12.id, altRoles: ['crs'],
  id: 'centaure-05-abri-mobile',
  title: 'Abri mobile',
  pitch: 'Avancer de deux cents mètres sous les jets avec huit gendarmes à l\'abri derrière soi, pour récupérer un blessé.',
  briefing: [
    `Rue de Rivoli, le long des arcades, le cortège sauvage vient de blesser un agent qui n'a pas pu rejoindre la ligne. Il est à deux cents mètres, entouré de projectiles. Le Centaure est votre seul moyen de l'atteindre.`,
    `Votre mission est d'avancer sur deux cents mètres avec huit gendarmes à pied derrière vous, à l'abri de la caisse, pour récupérer le blessé et le ramener. Vous êtes pilote : votre vitesse se règle sur le pas des gendarmes.`,
    `Avancez à six kilomètres-heure. Les gendarmes progressent en colonne par deux dans la zone abritée. Arrêtez-vous à dix mètres du blessé. Deux gendarmes l'extraient, le portent dans le blindé. Repartez en marche arrière, la colonne toujours à couvert.`,
    `Ne laissez aucun gendarme à découvert plus de dix secondes. Le blindé roule sur la chaussée, jamais sous les arcades : entre leurs piliers et les grilles du jardin des Tuileries, il reste peu de marge. Un manifestant devant la lame n'est pas un obstacle : arrêtez-vous.`,
  ],
  intel: intel(
    'Trois cents personnes en cortège sauvage, sous les arcades.',
    'Une soixantaine d\'individus encagoulés.', ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Avancer à six kilomètres-heure', 'Garder les gendarmes à couvert', 'S\'arrêter devant toute personne']),
  phases: [
    ph('depart', 'Départ', 'Le blindé avance, les hommes derrière.', T(90),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Colonne de HUIT dans la zone abritée, avancez. PARLEZ.']], []),
    ph('avance', 'Avancée sous les jets', 'Deux cents mètres de projectiles.', T(300),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Avance, jets de projectiles. PARLEZ.']], ['Un cocktail éclate sur le capot']),
    ph('extraction', 'Extraction', 'Vous récupérez le blessé.', TENS(0.55),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Blessé à bord, repli. PARLEZ.']], []),
    ph('fin', 'Retour', 'Vous ramenez le blessé à la ligne.', FIN, [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. Blessé reçu. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Récupérer le blessé et le ramener', 'secourir', { target: 'agent_blesse', count: 1 }),
    ob('o2', 'Ne laisser aucun gendarme à découvert plus de dix secondes', 'personnalise', { target: 'gendarme_a_decouvert', seconds: 10 }),
    os('o3', 'Ne heurter personne', 'limiter_blesses', { max: 0 }),
    os('o4', 'Ramener le blindé intact', 'personnalise', { target: 'blinde_endommage', max: 0 }),
  ],
  failures: [fail('personnalise', 'Gendarme laissé à découvert plus de dix secondes.', 10), fail('bavure_grave', 'Une personne est heurtée.')],
  randomEvents: ['Un cocktail éclate sur le capot', 'Un passant traverse devant la lame', 'Un gendarme est touché', 'Une arcade est bloquée'],
  unique: 'Le blindé devient un abri : on avance au rythme des hommes à pied.',
  tags: ['abri', 'miroir'],
});

export const CENT_06 = mission({
  ...OPERATEUR, type: 'emeute_nocturne', difficulty: 3, chapter: 12,
  id: 'centaure-06-vision-de-nuit',
  title: 'Vision de nuit',
  pitch: 'Dans la fumée et le noir, la caméra thermique du Centaure est vos yeux : désigner et appuyer sans voir.',
  briefing: [
    `Place de la République, deux heures du matin. Des barricades brûlent, la fumée est épaisse, l'éclairage urbain est coupé. Le Centaure est équipé d'une caméra thermique. Des groupes mobiles circulent dans la fumée.`,
    `Vous êtes opérateur : votre mission est de désigner par radio les groupes mobiles au chef de groupe, de guider les gendarmes à pied à travers la fumée et de ne tirer qu'au signal.`,
    `Allumez la caméra thermique. Balayez de gauche à droite. Annoncez chaque groupe : nombre, direction, attitude. Le chef décide. Vous lancez une salve de six grenades si l'ordre est donné.`,
    `La caméra thermique ne distingue pas un manifestant d'un pompier : vérifiez les gilets. Ne tirez pas sur une source de chaleur sans identification. Les barricades en feu aveuglent.`,
  ],
  place: 'Place de la République', timeOfDay: 2, weather: 'brouillard', windFrom: 230, windSpeed: 1,
  crowd: crowd(400, '', 0.65, 0.8, 0.3, { black_bloc: 0.3, fetards: 0.3, curieux: 0.4 },
    ['Place de la République', 'Boulevard du Temple'], 0.05),
  forces: forces({ sections: 2, fourgons: 6, centaure: 1, pelotons: 1, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Quatre cents personnes dans la fumée, la nuit.',
    'Une centaine d\'individus déterminés en groupes mobiles.', ['Place de la République', 'Boulevard du Temple'],
    ['Utiliser la caméra thermique', 'Vérifier les gilets des pompiers', 'Ne tirer qu\'au signal']),
  phases: [
    ph('observation', 'Observation thermique', 'Vous balayez la place à la caméra thermique.', T(180),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Groupe de UN-CINQ à l\'est, à CENT cinquante mètres. PARLEZ.']], []),
    ph('designation', 'Désignation', 'Vous désignez les groupes au chef.', T(360),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Salve de SIX sur le groupe désigné. FAITES L\'APERÇU.']], ['Un pompier traverse la zone thermique']),
    ph('appui', 'Appui', 'Vous appuyez l\'avancée des gendarmes.', TENS(0.75),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Salve tirée. PARLEZ.']], []),
    ph('fin', 'Retour au calme', 'Les groupes se dispersent.', FIN, [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Fin d\'emploi. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Désigner correctement au moins quatre groupes mobiles', 'reperer_signaux', { count: 4 }),
    ob('o2', 'Ne tirer que sur désignation du chef', 'zero_bavure'),
    os('o3', 'Ne jamais viser un pompier ou un secouriste', 'limiter_blesses', { max: 0 }),
    os('o4', 'Guider les gendarmes à pied à travers la fumée', 'guider_unite', { count: 1 }),
  ],
  failures: [fail('bavure_grave', 'Tir sur un tiers.'), fail('joueur_hors_combat', 'Équipage hors de combat.')],
  randomEvents: ['Un pompier traverse la zone', 'La caméra thermique tombe en panne', 'Retour de gaz', 'Un jet de cocktail'],
  unique: 'Voir sans voir : la caméra thermique rend la nuit lisible mais pas innocente.',
  tags: ['nuit', 'thermique'],
});

export const CENT_07 = mission({
  ...PILOTE, type: 'evacuation', difficulty: 2, chapter: 12,
  id: 'centaure-07-bouchon-de-paille',
  title: 'Bouchon de paille',
  pitch: 'Cinquante tracteurs de paysans bloquent le cours la Reine : les évacuer sans casser un seul rétroviseur.',
  briefing: [
    `Cours la Reine, matin. Le « Convoi des Champs », cinquante tracteurs et une grande botte de paille, bloque la voie contre la « taxe Sillon ». Le préfet a ordonné la libération de la voie. Les agriculteurs sont calmes mais fermes.`,
    `Votre mission est de dégager la voie en dix minutes, sans violence, en poussant au besoin des tracteurs hors de la chaussée avec la lame du Centaure et en négociant avec les conducteurs. Vous êtes pilote.`,
    `Avancez à deux kilomètres-heure. Demandez au chef du convoi de dégager. Poussez uniquement les tracteurs inoccupés. Faites demander une dépanneuse en renfort. Évitez toute collision.`,
    `Les agriculteurs sont des civils, pas des émeutiers. Une collision avec un tracteur, c'est un incident majeur. Ne poussez jamais un tracteur avec quelqu'un à bord.`,
  ],
  place: 'Cours la Reine', timeOfDay: 9, weather: 'clair', windFrom: 260, windSpeed: 2,
  crowd: crowd(300, 'agricole', 0.2, 0.25, 0.01, { agriculteurs: 0.8, familles: 0.1, curieux: 0.1 },
    ['Cours la Reine', 'Place de la Concorde'], 0.1),
  forces: forces({ sections: 1, fourgons: 3, centaure: 1, pelotons: 1, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents agriculteurs et cinquante tracteurs ; ambiance calme et ferme.',
    'Aucun signalement.', ['Cours la Reine', 'Place de la Concorde'],
    ['Négocier avant de pousser', 'Ne pousser que les tracteurs vides', 'Prévenir une dépanneuse']),
  phases: [
    ph('approche', 'Approche', 'Le Centaure s\'approche à deux kilomètres-heure.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Avancez au pas, négociez d\'abord. PARLEZ.']], []),
    ph('negociation', 'Négociation', 'La liaison obtient le départ de vingt tracteurs.', T(300),
      [['LIAISON', 'CENTAURE UN ICI LIAISON. Vingt tracteurs ont accepté de partir. PARLEZ.']], ['Un tracteur refuse de bouger']),
    ph('poussee', 'Poussée', 'Vous poussez les tracteurs vides.', TENS(0.4),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Obstacle vérifié, tracteur vide. APERÇU. TERMINÉ.']], []),
    ph('fin', 'Voie libre', 'Le cours la Reine est dégagé.', FIN, [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Voie libre. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Dégager le cours la Reine en dix minutes', 'degager_barricade', { place: 'Cours la Reine', seconds: 600 }),
    ob('o2', 'Ne causer aucune collision avec un tracteur occupé', 'personnalise', { target: 'collision_tracteur_occupe', max: 0 }),
    os('o3', 'Obtenir le départ volontaire d\'au moins vingt tracteurs', 'prevention', { count: 20 }),
    os('o4', 'Ne blesser personne', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Collision avec un tracteur occupé.'), fail('temps', 'Voie non dégagée en quinze minutes.', 900)],
  randomEvents: ['Un tracteur refuse de bouger', 'Un enfant monte sur une botte de paille', 'Un agriculteur s\'enchaîne', 'Une panne de dépanneuse'],
  unique: 'Un blindé face à des tracteurs : la force brute ne fait pas la mission, la patience oui.',
  tags: ['agricole', 'tracteurs'],
});

export const CENT_08 = mission({
  ...CHEF, type: 'manifestation_interdite', difficulty: 4, chapter: 12,
  id: 'centaure-08-chef-d-engin',
  title: 'Chef d\'engin',
  pitch: 'Coordonner un pilote et un opérateur, refuser un tir demandé hors cadre et couvrir un peloton sur l\'avenue de la Grande-Armée.',
  briefing: [
    `Avenue de la Grande-Armée, manifestation interdite. Un peloton de gendarmes mobiles est face à un groupe de trois cents personnes. Le Centaure est en appui, avec un pilote et un opérateur sous vos ordres. Le commandant de l'escadron vous demande une salve que vous jugez injustifiée : devant vous, le cortège est assis et calme.`,
    `Vous êtes chef d'engin : votre mission est de coordonner le pilote et l'opérateur, de couvrir le peloton, de faire part de vos objections à un ordre de tir hors cadre et de rendre compte avec exactitude.`,
    `Donnez vos ordres brefs : « Pilote, avancez de vingt mètres. » « Opérateur, salve de six sur la zone. » Si l'ordre reçu vous paraît hors cadre, répondez : « Négatif, cadre non réuni. Je fais part de mes objections et je demande confirmation. » Rendez compte de chaque salve.`,
    `Le chef d'engin est responsable de chaque tir. Un ordre illégal doit être refusé. Un tir hors cadre est une faute lourde pour l'équipage entier.`,
  ],
  place: 'Avenue de la Grande Armée', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 4,
  crowd: crowd(500, 'libertes', 0.5, 0.6, 0.15, { gilets_jaunes: 0.3, black_bloc: 0.15, syndical: 0.2, curieux: 0.35 },
    ['Avenue de la Grande Armée', 'Place Charles de Gaulle'], 0.5),
  forces: forces({ pelotons: 1, centaure: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes sur l\'avenue ; un peloton de gendarmes face à elles.',
    'Une soixantaine d\'individus déterminés.', ['Avenue de la Grande Armée', 'Place Charles de Gaulle'],
    ['Coordonner pilote et opérateur', 'Refuser un tir hors cadre', 'Rendre compte à chaque salve']),
  phases: [
    ph('appui', 'Appui du peloton', 'Le Centaure couvre le peloton.', T(180),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Couvrez le peloton, avancez de DEUX-ZÉRO mètres. PARLEZ.']], []),
    ph('demande', 'Demande de tir', 'La salle demande une salve sans cadre.', T(360),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. NÉGATIF, cadre non réuni. Cortège pacifique devant. PARLEZ.']], ['Un gendarme demande un tir']),
    ph('assaut', 'Assaut', 'Un groupe attaque le peloton ; le tir devient légitime.', TENS(0.6),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Salve de SIX, zone carrefour, tir courbe. FAITES L\'APERÇU.']], []),
    ph('fin', 'Fin', 'Le groupe se replie.', FIN, [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Consommation : SIX grenades. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Couvrir le peloton pendant toute l\'action', 'proteger_site', { target: 'peloton' }),
    ob('o2', 'Refuser le tir hors cadre', 'zero_bavure'),
    os('o3', 'Rendre compte de chaque salve', 'personnalise', { target: 'compte_rendu', count: 2 }),
    os('o4', 'Coordonner le pilote et l\'opérateur sans ordre contradictoire', 'personnalise', { target: 'coordination' }),
  ],
  failures: [fail('bavure_grave', 'Tir hors cadre exécuté.'), fail('personnalise', 'Un gendarme est laissé à découvert.')],
  randomEvents: ['Ordre contradictoire de la salle', 'Panne radio', 'Un gendarme demande un tir', 'Retour de gaz'],
  unique: 'Le chef d\'engin est la dernière barrière avant la faute.',
  tags: ['commandement', 'cadre'],
});

export const CENT_09 = mission({
  ...PILOTE, type: 'protection_secours', difficulty: 4, chapter: 12,
  id: 'centaure-09-nuit-de-violences',
  title: 'Nuit de violences',
  pitch: 'Ouvrir un itinéraire aux secours à travers quatre obstacles, sans une seule salve inutile, avec un équipage complet.',
  briefing: [
    `Boulevard Voltaire, minuit. Quatre obstacles successifs barrent l'axe vers un immeuble en feu : une barricade, un véhicule incendié, une zone de verre brisé, un barrage de poubelles. Les pompiers sont bloqués à six cents mètres.`,
    `Votre mission est d'ouvrir un itinéraire aux secours à travers les quatre obstacles en dix minutes, avec un équipage complet que vous pouvez faire tourner : pilote, opérateur, chef. Vous changez de siège librement.`,
    `Alternez les sièges : pilote pour pousser, opérateur pour surveiller, chef pour commander. Priorité à l'ouverture du passage. Aucune salve si elle n'est pas nécessaire. Les pompiers suivent à vingt mètres.`,
    `Chaque salve inutile pèsera sur votre évaluation. Ne poussez pas un véhicule sans l'avoir vérifié. Les pompiers sont plus importants que le blindé : si un pompier est blessé, la mission échoue.`,
  ],
  place: 'Boulevard Voltaire', timeOfDay: 0, weather: 'couvert', windFrom: 240, windSpeed: 3,
  crowd: crowd(400, '', 0.65, 0.8, 0.35, { black_bloc: 0.35, fetards: 0.25, curieux: 0.4 },
    ['Boulevard Voltaire', 'Place de la République'], 0.05),
  forces: forces({ sections: 2, fourgons: 6, centaure: 1, pelotons: 1, pompiers: 4, samu: 1 }),
  intel: intel(
    'Quatre cents personnes autour de quatre obstacles ; un immeuble en feu.',
    'Une centaine d\'individus déterminés.', ['Boulevard Voltaire', 'Place de la République'],
    ['Tourner les sièges', 'Ne pas tirer sans nécessité', 'Garder les pompiers à vingt mètres']),
  phases: [
    ph('obstacle-un', 'Premier obstacle', 'Barricade de poubelles.', T(120),
      [['ÉPERVIER', 'CENTAURE UN ICI ÉPERVIER. Premier obstacle, dégagez. PARLEZ.']], []),
    ph('obstacle-deux', 'Deuxième et troisième obstacles', 'Véhicule incendié et verre brisé.', T(360),
      [['CENTAURE 1', 'ÉPERVIER ICI CENTAURE UN. Véhicule en feu, appel pompiers. PARLEZ.']], ['Pneu qui éclate : détonation']),
    ph('obstacle-trois', 'Quatrième obstacle', 'Barrage final de poubelles.', TENS(0.75),
      [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. En approche à DEUX-ZÉRO mètres. PARLEZ.']], []),
    ph('fin', 'Itinéraire ouvert', 'Les pompiers atteignent l\'immeuble.', FIN, [['SANTÉ 1', 'CENTAURE UN ICI SANTÉ UN. Sur place. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Ouvrir l\'itinéraire en dix minutes', 'degager_barricade', { place: 'Boulevard Voltaire', count: 4, seconds: 600 }),
    ob('o2', 'Faire passer les pompiers sans blessé', 'proteger_site', { target: 'pompiers' }),
    os('o3', 'Ne tirer aucune salve inutile', 'zero_bavure'),
    os('o4', 'Changer de siège au moins une fois', 'personnalise', { target: 'rotation_sieges' }),
  ],
  failures: [fail('temps', 'Itinéraire non ouvert en dix minutes.', 600), fail('victime_non_secourue', 'Un pompier est blessé.')],
  randomEvents: ['Un pneu éclate', 'Un cocktail incendiaire sur le blindé', 'Un riverain demande de l\'aide', 'Retour de gaz'],
  unique: 'L\'équipage complet : on apprend à changer de siège selon ce que la rue exige.',
  tags: ['equipage', 'secours', 'nuit'],
});

export const CENTAURE: MissionDef[] = [
  CENT_01, CENT_02, CENT_03, CENT_04, CENT_05, CENT_06, CENT_07, CENT_08, CENT_09,
];
