/* =====================================================================================
 * Catalogue — équipage du Centaure (gendarmerie mobile) : pilote, opérateur, chef d'engin.
 * Détachement facultatif de la carrière (chapitre 12) ; indicatifs « ÉPERVIER » et « CENTAURE ».
 * Le Centaure dégage et pousse (lame) et lance des grenades ; c'est le canon à eau qui éteint.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, scene, SOMMATIONS, T, TENS, voix } from './dsl';
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
    ph('gabarit', `Trois mètres de large, quatre de haut`,
      `Place de Varsovie, dans la brume, au pied des jardins du Trocadéro. Le Centaure d'instruction vous attend, moteur tournant : près de trois mètres de large, presque quatre de haut, et des angles morts où tiendrait une voiture. Premier exercice : passer au pas entre deux files de plots, sans en toucher un.`,
      T(30), [
        voix('CHEF D\'ENGIN', `Ceinture, caméras périphériques allumées. Tu ne regardes pas par le pare-brise, tu regardes tes écrans.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Parcours d'instruction. Démarrez, passage entre les plots au pas, UN-ZÉRO plots de chaque côté.`),
      ]),
    ph('plots', `Dix plots de chaque côté`,
      `Le couloir de plots est à peine plus large que la caisse, et le brouillard mange les repères de la place de Varsovie au-delà de vingt mètres. Au bout du couloir, un demi-tour aux caméras, puis la marche arrière jusqu'au repère peint au sol.`,
      OBJ('o1'), [
        voix('CHEF D\'ENGIN', `Doucement. À gauche, tu as trente centimètres. À droite, tu ne vois rien : fais confiance à l'écran.`),
        voix('MONITEUR', `Cycliste dans l'angle mort arrière droit ! Qui l'a vu ?`),
      ], [`Un cycliste passe dans l'angle mort`, `Un plot s'effondre au passage`]),
    ph('barriere', `Vérifier, annoncer, pousser`,
      `Dix plots de chaque côté, aucun au sol. Dernier exercice : une barrière de chantier en travers, à dix mètres de la lame, côté pont d'Iéna. On ne pousse jamais sans savoir ce qu'il y a derrière : arrêt, vérification par l'opérateur, annonce au haut-parleur, puis cinq kilomètres-heure.`,
      OBJ('o2'), [
        rad('ÉPERVIER', 'CENTAURE 1', `Vérifiez l'obstacle, puis dégagez la barrière.`, 'A'),
        voix('OPÉRATEUR', `Attends ! Il y a quelque chose derrière la barrière. Une forme, au sol. Je vérifie à la caméra.`),
      ], [`Le moniteur a placé un mannequin derrière la barrière`]),
    ph('debarquement', `Débarquer à l'abri de la caisse`,
      `L'obstacle a été vérifié avant d'être poussé. Le Centaure s'immobilise au milieu de la place de Varsovie et les gendarmes embarqués descendent par l'arrière, dans la zone abritée : trois mètres de large sur six, pas un pas en dehors.`,
      FIN, [
        voix('MONITEUR', `Ce que vous venez de faire avec une barrière, vous le referez avec une barricade en feu. La règle ne change pas : on vérifie, on annonce, on pousse.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Fin de parcours. Moteur coupé, équipage au rapport.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Suivre le parcours de plots sans en toucher un seul, jusqu\'à l\'esplanade Bernard Duperier', 'atteindre', { place: 'Esplanade Bernard Duperier', target: 'parcours_cones', count: 10 }),
    ob('o2', 'Amener la lame à la barrière du pont d\'Iéna et vérifier l\'obstacle avant de pousser', 'atteindre', { place: 'Pont d\'Iéna', target: 'barriere', count: 1 }),
    os('o3', 'S\'arrêter à dix mètres de l\'obstacle', 'personnalise', { target: 'arret_precis' }),
  ],
  failures: [fail('bavure_grave', 'Poussée sans vérification.'), fail('temps', 'Temps d\'atelier dépassé.', 300)],
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
    ph('approche', `Au pas dans la rue Royale`,
      `Rue Royale, une barricade de huit mètres de large brûle d'une façade à l'autre : poubelles, barrières, trottinettes électriques. Derrière elle, un immeuble fume, et les pompiers attendent place de la Madeleine. Le Centaure s'engage au pas, le peloton en colonne dans la zone abritée, sous les premiers projectiles.`,
      T(100), [
        rad('ÉPERVIER', 'CENTAURE 1', `Engagez-vous rue Royale. Arrêt à UN-ZÉRO mètres de l'obstacle, vérification, puis dégagement. Le peloton progresse derrière vous.`, 'A'),
        voix('CHEF D\'ENGIN', `Cinq à l'heure, pas plus. Tu as huit gendarmes à pied dans ton dos.`),
      ], [`Jets de projectiles sur le blindé`]),
    ph('verification', `Personne derrière, personne dedans`,
      `Arrêt à dix mètres. La fumée noire du plastique masque tout ce qui se trouve derrière la barricade de la rue Royale ; l'opérateur balaie à la caméra thermique, foyer par foyer. À quatre mètres de la lame, sur le trottoir, un photographe de presse refuse de reculer.`,
      T(60), [
        voix('OPÉRATEUR', `Je vérifie. Les foyers saturent la caméra… Attends, j'ai une silhouette à droite, derrière le bac. Elle bouge.`),
        voix('CHEF D\'ENGIN', `Annonce au haut-parleur : engin en mouvement, écartez-vous de l'obstacle. On ne bouge pas tant qu'il reste quelqu'un.`),
      ], [`Une personne est cachée derrière un bac`, `Un journaliste se tient à quatre mètres de la lame`]),
    ph('batteries', `Laisser cracher les batteries`,
      `L'obstacle est vérifié, mais le cœur de la barricade de la rue Royale est un tas de trottinettes dont les batteries s'embrasent une à une, étincelles à trois mètres. Pousser maintenant, c'est emmener le feu sous la caisse, avec le peloton derrière : on attend que le plus violent soit passé.`,
      T(80), [
        voix('CHEF D\'ENGIN', `On attend. Trente secondes, le temps que les batteries crachent ce qu'elles ont.`),
        rad('SAPEUR 1', 'CENTAURE 1', `Je suis place de la Madeleine. Dès que vous ouvrez, j'entre. Ne roulez pas dans le feu.`),
      ], [`Une batterie de trottinette projette des étincelles à trois mètres`]),
    ph('poussee', `Pousser en deux temps`,
      `La lame entre dans la barricade à cinq kilomètres-heure et la coupe en deux, pour diviser le feu en foyers que les pompiers pourront noyer. Dans la rue Royale, le peloton suit à l'abri de la caisse ; un manifestant court vers l'engin et tente de grimper sur la lame.`,
      OBJ('o1'), [
        voix('CHEF D\'ENGIN', `Premier temps, moitié gauche, trois mètres. Stop. Tu recules de deux, et on prend la droite.`),
        rad('ÉPERVIER 1', 'CENTAURE 1', `Peloton à couvert derrière vous. Ne reculez pas sans m'annoncer : j'ai des hommes dans votre angle mort.`),
      ], [`Un manifestant monte sur la lame`, `Un engin incendiaire éclate sur le capot`]),
    ph('breche', `Le peloton occupe la brèche`,
      `Le passage est ouvert au milieu de la rue Royale, quatre mètres entre deux tas qui brûlent encore. Le peloton sort de l'abri et occupe la brèche ; le fourgon des pompiers remonte de la place de la Madeleine, et c'est lui, pas vous, qui éteindra ce que la lame a séparé.`,
      FIN, [
        rad('SAPEUR 1', 'CENTAURE 1', `Je m'engage dans la brèche. Reculez de UN-ZÉRO mètres et laissez-moi les foyers.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Brèche tenue par le peloton. Restez en appui, moteur tournant.`, 'T'),
      ]),
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
    ph('poubelles', `Première barricade : des poubelles`,
      `Boulevard de Strasbourg, à la nuit tombante. Trois barricades se suivent sur trois cents mètres ; la première n'est qu'un alignement de poubelles et de conteneurs vides. Vérification rapide, annonce, poussée directe : dix minutes pour ouvrir tout l'axe aux pompiers, qui attendent au carrefour du boulevard de Magenta.`,
      T(90), [
        rad('ÉPERVIER', 'CENTAURE 1', `Trois obstacles sur l'axe. Vous avez UN-ZÉRO minutes. Vérifiez chacun avant de pousser.`, 'A'),
        voix('OPÉRATEUR', `Première : vide. Rien derrière, rien dedans. Tu peux y aller.`),
      ], [`Des bouteilles tombent sur le toit du blindé`]),
    ph('palettes', `Deuxième barricade : des palettes`,
      `La deuxième barricade est faite de palettes empilées sur deux mètres de haut, et l'on ne voit rien au travers. Approche lente, arrêt à dix mètres, en plein milieu du boulevard de Strasbourg : entre deux palettes, la caméra accroche une forme accroupie.`,
      T(150), [
        voix('OPÉRATEUR', `Stop ! J'ai quelqu'un dans les palettes. Accroupi, côté gauche. Il ne bouge pas.`),
        voix('CHEF D\'ENGIN', `On ne pousse pas. Haut-parleur, et on attend qu'il sorte. Le temps, on le rattrapera ailleurs.`),
      ], [`Un manifestant se cache derrière les palettes`]),
    ph('verification-du-feu', `Vérifier ce qui brûle`,
      `La troisième barricade brûle : une voiture retournée, des vélos électriques jetés dessus, des pneus. La chaleur sature la caméra thermique et la fumée noire couvre le boulevard de Strasbourg sur toute sa largeur ; il faut pourtant savoir s'il y a quelqu'un dans cette voiture, ou derrière elle, avant d'y mettre la lame.`,
      T(60), [
        voix('OPÉRATEUR', `Je ne vois rien à la thermique, tout est blanc. Avance de deux mètres, je regarde à l'œil par le côté.`),
        rad('ÉPERVIER 1', 'CENTAURE 1', `Deux de mes hommes font le tour par le trottoir pour voir l'arrière de la voiture. Ne bougez pas avant mon signal.`),
      ], [`La caméra thermique est saturée par le foyer`]),
    ph('deux-temps', `Diviser le feu en deux temps`,
      `Personne dans la voiture, personne derrière. La lame coupe le tas en deux, sans jamais s'arrêter sur les batteries ni laisser une flamme contre un flanc ; entre deux poussées, dix mètres de recul sur le boulevard de Strasbourg, le peloton toujours à l'abri.`,
      OBJ('o1'), [
        voix('CHEF D\'ENGIN', `Deux temps. Tu coupes le tas, tu recules de dix. Si ça lèche le flanc, tu sors tout de suite.`),
        rad('SAPEUR 1', 'CENTAURE 1', `En attente au carrefour Magenta. Séparez-moi la voiture des vélos, je m'occupe du reste.`),
      ], [`Étincelles de batteries sur le flanc du blindé`, `Un pneu éclate dans le feu`]),
    ph('axe-ouvert', `L'axe ouvert sur une voie`,
      `Trois obstacles, trois vérifications. Le boulevard de Strasbourg est ouvert sur une voie et le fourgon des pompiers s'y engage à son tour, lances prêtes. Le Centaure se range contre le trottoir, moteur tournant : ce qui brûle encore est leur affaire, pas la vôtre.`,
      FIN, [
        rad('SAPEUR 1', 'CENTAURE 1', `Je passe. Tenez-vous à l'écart des lances et gardez-moi l'axe derrière.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Axe ouvert, reçu. Peloton en protection des pompiers. Rendez compte de l'état de l'engin.`),
      ]),
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
    ph('reiteration', `Trente tubes chargés`,
      `Place Charles de Gaulle, le Centaure est en retrait de la ligne, face à l'avenue de la Grande Armée, d'où deux cents individus lancent pavés et mortiers. À cent cinquante mètres, sur l'avenue Foch, trois cents manifestants pacifiques attendent, assis. Dans la tourelle, trente tubes chargés ; dehors, le commandant réitère la dernière sommation.`,
      T(120), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        rad('ÉPERVIER', 'CENTAURE 1', `Dernière sommation réitérée. Usage des armes : lance-grenades, tir courbe. Salve de QUATRE sur la zone désignée, à mon ordre.`, 'C'),
      ], [`Jets de pavés et de mortiers sur la ligne`]),
    ph('premiere-salve', `Quatre tubes sur trente`,
      `Le chef d'engin désigne la zone : le milieu de l'avenue de la Grande Armée, cinquante mètres devant la ligne, loin de l'avenue Foch. Vous réglez la hausse pour un tir courbe, vous annoncez, vous lancez quatre grenades, puis vous regardez le nuage : c'est lui qui dit si la salve était juste.`,
      T(150), [
        voix('CHEF D\'ENGIN', `Opérateur, salve de quatre, zone désignée, tir courbe… Tir !`),
        voix('PILOTE', `Vent d'ouest, cinq mètres par seconde, il prend de travers. Regarde où part ta fumée.`),
      ], [`Un journaliste entre dans la zone désignée`]),
    ph('vent', `Le nuage dérive vers l'avenue Foch`,
      `Le vent tourne de quarante degrés et le nuage glisse le long de la place Charles de Gaulle vers l'avenue Foch, où les personnes assises commencent à tousser. Sur la fréquence, on réclame une salve complète pour en finir ; dans la tourelle, c'est le moment de dire non, ou d'attendre.`,
      T(150), [
        rad('ÉPERVIER 2', 'CENTAURE 1', `On prend toujours des pavés sur la ligne ! Videz vos tubes, qu'on en finisse !`),
        voix('CHEF D\'ENGIN', `Ton nuage part sur les pacifiques. Qu'est-ce que tu proposes : on suspend, ou on déplace la zone ?`),
      ], [`Le vent tourne et pousse le nuage vers le cortège pacifique`, `Un chef de peloton réclame une salve complète`, `Un enfant est aperçu dans le nuage`]),
    ph('seconde-salve', `Une seconde salve, ou pas`,
      `Le vent retombe. Les violents se sont regroupés plus loin sur l'avenue de la Grande Armée et relancent ; chaque salve doit répondre à une violence constatée, et le plafond est de douze grenades pour toute l'action. Évaluer l'effet, proposer la zone, tirer court et juste, ou ne pas tirer.`,
      OBJ('o1'), [
        rad('ÉPERVIER', 'CENTAURE 1', `Seconde salve possible si la zone est sûre. Plafond : UN-DEUX grenades au total. Rendez compte après chaque tir.`),
        voix('CHEF D\'ENGIN', `Combien il t'en faut ? Deux, quatre ? Dis-moi le chiffre avant de toucher à la détente.`),
      ], [`Des touristes passent derrière la zone visée`, `Un tube s'enraye`]),
    ph('avenue-foch', `Ceux de l'avenue Foch`,
      `Les violents ont lâché l'avenue de la Grande Armée. Sur l'avenue Foch, le cortège pacifique est toujours assis ; quelques personnes se rincent les yeux à la bouteille, et la liaison marche vers elles. Depuis la tourelle, vous regardez ce qu'il reste de fumée, et dans quel sens elle part.`,
      T(120), [
        rad('ÉPERVIER', 'CENTAURE 1', `La liaison signale des yeux irrités dans le cortège de l'avenue Foch. Votre dernière salve : heure, zone, nombre ?`),
        voix('PILOTE', `Ils n'ont pas bougé d'un mètre, les assis. Si ton nuage est allé jusque-là, ça se verra sur toutes les vidéos.`),
      ], [`La liaison signale des yeux irrités dans le cortège pacifique`]),
    ph('tubes-comptes', `Halte au feu, tubes comptés`,
      `L'ordre de cesser tombe sur la place Charles de Gaulle : le trouble a pris fin. Dans la tourelle, vous comptez les tubes vides un par un ; le chiffre ira au compte rendu, à la grenade près, avec l'heure et la zone de chaque salve.`,
      FIN, [
        rad('ÉPERVIER', 'CENTAURE 1', `Halte au feu : le trouble a cessé. Rendez compte de votre consommation, tube par tube.`),
        voix('CHEF D\'ENGIN', `Combien de partis ? Je veux le chiffre et l'heure de chaque salve.`),
      ]),
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
    ph('deux-cents-metres', `Deux cents mètres sous les jets`,
      `Rue de Rivoli, le long des arcades. À deux cents mètres, un agent blessé par le cortège sauvage est resté au sol, adossé à un pilier, sous les projectiles. Vous avancez à six kilomètres-heure, huit gendarmes en colonne par deux dans la zone abritée ; entre les piliers et les grilles du jardin des Tuileries, il reste un mètre de marge de chaque côté.`,
      T(220), [
        rad('ÉPERVIER', 'CENTAURE 1', `UN agent blessé à DEUX-ZÉRO-ZÉRO mètres devant vous, côté arcades. Avancez, le peloton derrière vous. Arrêt à UN-ZÉRO mètres du blessé.`, 'A'),
        voix('OPÉRATEUR', `Obstacle léger devant : poubelles, barrières. Je vérifie… vide. Passant à droite, à cinq mètres, il traverse !`),
        rad('ÉPERVIER 1', 'CENTAURE 1', `Vous nous distancez ! Ralentissez, j'ai deux hommes à découvert.`),
      ], [`Un engin incendiaire éclate sur le capot`, `Un passant traverse devant la lame`, `La fumée aveugle les caméras`]),
    ph('extraction', `Dix mètres avant le blessé`,
      `Arrêt net à dix mètres du pilier, la caisse en travers de la rue de Rivoli pour faire écran. Deux gendarmes sortent de l'abri, relèvent l'agent blessé et le portent jusqu'à la porte arrière ; pendant ces secondes-là, vous ne bougez pas d'un centimètre, quoi qu'il tombe sur le blindage.`,
      OBJ('o1'), [
        voix('CHEF D\'ENGIN', `Halte ! Frein, et tu ne touches plus à rien. Ils sortent le chercher.`),
        rad('ÉPERVIER 1', 'CENTAURE 1', `Deux hommes sortent. Couvrez-les avec la caisse, ne bougez pas avant mon signal.`),
      ], [`Un gendarme est touché par un projectile pendant l'extraction`, `Un civil s'est réfugié sous un porche voisin`]),
    ph('marche-arriere', `Le retour en marche arrière`,
      `Le blessé est à bord, allongé sur le plancher. Il faut refaire les deux cents mètres de la rue de Rivoli en marche arrière, aux caméras, avec la colonne qui recule à couvert au même pas ; on ne recule jamais sans visibilité, et jamais plus vite que ceux qui marchent.`,
      T(180), [
        voix('OPÉRATEUR', `Caméra arrière : colonne en place, rien derrière eux. Tu peux reculer, au pas.`),
        rad('SANTÉ 1', 'CENTAURE 1', `En attente derrière la ligne, angle de la rue de Castiglione. Annoncez-moi l'état du blessé.`),
      ], [`Une barricade légère est tirée derrière le blindé`]),
    ph('jonction', `La jonction avec la ligne`,
      `Le Centaure repasse la ligne des CRS à l'angle de la rue de Castiglione et s'arrête à hauteur de l'ambulance. La porte arrière s'ouvre ; le peloton se compte, les secours prennent le blessé, et vous faites le tour de la caisse pour voir ce qu'elle a reçu.`,
      FIN, [
        rad('ÉPERVIER', 'CENTAURE 1', `Ligne repassée. Remettez le blessé à SANTÉ UN et rendez compte de l'état de l'engin.`),
        voix('CHEF D\'ENGIN', `Ne coupe pas le moteur. Tu descends, tu fais le tour, tu me dis ce qui a pris.`),
      ]),
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
    ph('veille', `La place en nuances de gris`,
      `Deux heures du matin, place de la République. L'éclairage public est coupé, des barricades brûlent et la fumée se mêle au brouillard : à l'œil nu, on ne voit pas à vingt mètres. Dans la tourelle, la caméra thermique dessine la place en nuances de gris, et tout ce qui est chaud y ressemble à une menace.`,
      T(120), [
        rad('ÉPERVIER', 'CENTAURE 1', `Vous êtes mes yeux. Balayage thermique de la place, de gauche à droite. Pour chaque groupe : nombre, direction, attitude. Aucun tir sans mon ordre.`, 'A'),
        voix('CHEF D\'ENGIN', `Les barricades en feu vont t'aveugler. Change de polarité quand tu balaies de ce côté.`),
      ], [`L'éclairage public est coupé sur toute la place`]),
    ph('quatre-groupes', `Quatre groupes dans la fumée`,
      `Des groupes mobiles circulent entre la statue de la République et le débouché du boulevard du Temple : des taches claires qui se rassemblent, se séparent, lancent et repartent. Quatre désignations justes sont attendues ; un riverain à son balcon, un pompier en intervention et le reflet d'une vitrine chauffée par un foyer n'en font pas partie.`,
      OBJ('o1'), [
        voix('PILOTE', `Tache chaude au premier étage, à droite. C'est un tireur, ou un type à sa fenêtre ?`),
        rad('ÉPERVIER 1', 'CENTAURE 1', `On reçoit des mortiers depuis le boulevard du Temple. D'où ça part ? Donnez-moi un cap et une distance.`),
      ], [`Un pompier traverse le champ de la caméra thermique`, `Le reflet d'une vitrine est pris pour une source chaude`, `Un riverain se tient à son balcon`]),
    ph('guidage', `Guider le peloton par la radio`,
      `Quatre groupes sont désignés. Le peloton s'enfonce à pied dans la fumée vers le boulevard du Temple, sans rien voir ; vous le guidez depuis la tourelle : cap, distance, obstacle. Une erreur de dix mètres, et huit gendarmes débouchent au milieu d'un groupe au lieu de le prendre de flanc.`,
      T(240), [
        rad('ÉPERVIER 1', 'CENTAURE 1', `Je suis dans la fumée, je ne vois rien. Guidez-moi sur le groupe du porche : cap et distance, tous les UN-ZÉRO mètres.`),
        voix('CHEF D\'ENGIN', `Projecteur sur le groupe, pas sur les nôtres. Tu éclaires devant eux, jamais dans leur visière.`),
      ], [`La caméra thermique tombe en panne trente secondes`, `Retour de gaz sur la place`]),
    ph('appui', `Six grenades, si l'ordre vient`,
      `Le peloton est au contact du groupe du porche, à l'entrée du boulevard du Temple. Si la pression monte encore, l'escadron demandera une salve de six ; la thermique ne distingue pas un émeutier d'un secouriste, et il y a, quelque part dans ce gris, les gilets des pompiers qui arrosent une barricade.`,
      FOULE('dispersion'), [
        rad('ÉPERVIER', 'CENTAURE 1', `Tenez-vous prêt : salve de SIX sur le débouché du boulevard du Temple, à mon ordre seulement. Identifiez d'abord qui s'y trouve.`),
        voix('PILOTE', `Les pompiers sont toujours à la barricade de gauche. Tu les as, sur ton écran ?`),
      ], [`Un engin incendiaire éclate près du blindé`]),
    ph('enregistrement', `Ce que la caméra a vu`,
      `Les groupes quittent la place de la République par le boulevard du Temple et les rues qui descendent vers le canal. La fumée se dépose, le brouillard reste. Dans la tourelle, l'enregistrement thermique de la nuit est une pièce : chaque désignation y figure, avec son heure.`,
      FIN, [
        rad('ÉPERVIER', 'CENTAURE 1', `Groupes en dispersion. Conservez l'enregistrement thermique et rendez compte de vos désignations.`),
        voix('CHEF D\'ENGIN', `Tu notes : combien de désignations, combien confirmées. Et s'il y a eu un tir, sur quel ordre.`),
      ]),
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
    ph('approche', `La lame devant les tracteurs`,
      `Cours la Reine, neuf heures. Cinquante tracteurs du « Convoi des Champs » sont rangés en travers de la voie, autour d'une montagne de bottes de paille, contre la « taxe Sillon ». Le Centaure s'approche à deux kilomètres-heure et s'arrête à trente mètres : ici, personne ne lance rien, et la lame fait peur à tout le monde.`,
      T(100), [
        rad('ÉPERVIER', 'CENTAURE 1', `Approche au pas, arrêt à TROIS-ZÉRO mètres. Vous ne poussez rien tant que la liaison parle. Ce sont des agriculteurs, pas des émeutiers.`, 'A'),
        voix('AGRICULTEUR', `Vous venez avec ça contre des tracteurs ? On n'a cassé la figure à personne, nous !`),
      ]),
    ph('delai', `Le délai négocié`,
      `La liaison a obtenu un délai : ceux qui veulent partir partent, les autres auront été prévenus. Un à un, vingt tracteurs démarrent et quittent le cours la Reine vers la place de la Concorde ; vous restez immobile, moteur au ralenti, visible et inutile, ce qui est exactement ce qu'on attend de vous.`,
      T(240), [
        rad('LIAISON', 'ÉPERVIER', `Le chef du convoi accepte de libérer une voie. Une vingtaine de tracteurs partent d'eux-mêmes, les autres veulent rester jusqu'à midi.`),
        voix('CHEF D\'ENGIN', `On ne bouge pas. Plus ils partent d'eux-mêmes, moins tu auras à pousser.`),
      ], [`Un tracteur refuse de démarrer`, `Un enfant grimpe sur une botte de paille`]),
    ph('remorques', `Trois remorques et de la paille`,
      `Restent trois remorques dételées, des balles de paille et quelques tracteurs sans personne à bord, en travers du cours la Reine. La lame pousse ce qui est vide, lentement, après que l'opérateur a regardé dans chaque cabine ; on ne touche jamais à un engin occupé, et un agriculteur vient justement de remonter dans le sien.`,
      OBJ('o1'), [
        voix('OPÉRATEUR', `Cabine du tracteur rouge : quelqu'un vient de remonter dedans ! On ne touche pas à celui-là.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Dégagez une voie de TROIS mètres CINQ-ZÉRO pour les secours. Engins vides uniquement, sans casse.`),
      ], [`Un agriculteur remonte dans sa cabine`, `Une botte de paille prend feu`, `Un agriculteur s'enchaîne à sa remorque`]),
    ph('voie-rouverte', `Une voie pour les secours`,
      `Une voie est ouverte sur le cours la Reine, large comme une ambulance, entre les remorques repoussées contre le trottoir. Les agriculteurs restés sur place font le tour de leur matériel, tôle par tôle : c'est ce qu'ils retiendront. Le reste se discutera sans vous, à pied.`,
      FIN, [
        rad('ÉPERVIER', 'CENTAURE 1', `Voie ouverte, reçu. Reculez de DEUX-ZÉRO mètres et coupez le moteur : la liaison reprend la main.`),
        voix('AGRICULTEUR', `On va regarder ce que vous avez abîmé. Et on reviendra, avec ou sans votre char.`),
      ]),
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
    ph('appui', `En appui du peloton`,
      `Avenue de la Grande Armée, le Centaure est en appui d'un peloton de gendarmes mobiles, face à trois cents personnes. Vous êtes chef d'engin : un pilote, un opérateur, trente tubes, et la responsabilité de chaque grenade qui en sortira. Devant vous, pour l'instant, la foule est assise sur la chaussée et chante.`,
      T(150), [
        rad('ÉPERVIER', 'CENTAURE 1', `Vous appuyez ÉPERVIER DEUX. Restez à DEUX-ZÉRO mètres derrière sa ligne. Tir sur mon ordre uniquement.`, 'A'),
        voix('PILOTE', `Chef, je me mets où ? Si j'avance encore, je masque le peloton.`),
      ], [`La foule s'assoit sur la chaussée`]),
    ph('ordre-hors-cadre', `Une salve sur des gens assis`,
      `L'ordre tombe sur la fréquence : une salve de six sur la foule de l'avenue de la Grande Armée, tout de suite. Devant votre pare-brise, trois cents personnes assises, aucune violence, aucune sommation entendue. Exécuter n'exonère pas : c'est à vous de répondre, sur la fréquence, avec les mots qui conviennent.`,
      OBJ('o1'), [
        rad('ÉPERVIER', 'CENTAURE 1', `Salve de SIX sur la foule devant ÉPERVIER DEUX. Exécutez.`),
        voix('OPÉRATEUR', `Chef, ils sont assis. Il n'y a pas eu de sommation. Je tire, ou je ne tire pas ?`),
      ], [`Un gendarme du peloton réclame le tir`, `Ordre contradictoire de la salle`]),
    ph('confirmation', `En attendant la confirmation`,
      `Vos objections sont passées sur la fréquence et notées au journal. L'escadron ne répond pas tout de suite ; le chef du peloton, lui, se retourne vers l'engin en écartant les bras, au milieu de l'avenue de la Grande Armée. Dans la cabine, deux équipiers attendent que vous disiez quelque chose.`,
      TENS(0.62), [
        rad('ÉPERVIER 2', 'CENTAURE 1', `Qu'est-ce que vous attendez ? On vous a donné un ordre !`),
        rad('ÉPERVIER', 'CENTAURE 1', `Objections reçues. Attendez.`, 'T'),
      ], [`Panne radio de trente secondes`, `Le chef de peloton conteste le refus`]),
    ph('assaut', `Le tir qui devient légitime`,
      `La tension vient de monter sur l'avenue de la Grande Armée : cinquante individus masqués contournent les personnes assises et attaquent le peloton, mortiers à tir tendu, un gendarme à terre. Cette fois le cadre est réuni : riposte à des violences. Des ordres brefs au pilote et à l'opérateur, une zone qui épargne les assis, et un compte rendu après chaque salve.`,
      T(200), [
        rad('ÉPERVIER', 'CENTAURE 1', `Violences sur ÉPERVIER DEUX : mortiers, UN gendarme à terre. Riposte : salve de SIX sur le groupe assaillant, tir courbe.`, 'C'),
        voix('OPÉRATEUR', `Zone désignée ? Les assis sont à trente mètres du groupe, chef. Je décale à gauche ?`),
      ], [`Un groupe masqué attaque le peloton`, `Un gendarme est à terre devant l'engin`, `Retour de gaz par vent tournant`]),
    ph('journal-de-bord', `Chaque salve au journal de bord`,
      `Le groupe assaillant se replie vers l'ouest et les personnes assises quittent l'avenue de la Grande Armée par les contre-allées. Dans la cabine, le journal de bord attend : l'ordre refusé, l'heure des objections, chaque salve tirée, sur quel ordre et dans quel cadre.`,
      FIN, [
        rad('ÉPERVIER', 'CENTAURE 1', `Halte au feu. Rendez compte : salves, nombre, heures. Vos objections figurent au journal.`),
        voix('PILOTE', `Vous avez bien fait, chef. Enfin… je crois. On verra ce qu'ils en disent là-haut.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Couvrir le peloton, avenue de la Grande Armée, quatre minutes au moins', 'tenir_position', { place: 'Avenue de la Grande Armée', target: 'peloton', seconds: 240 }),
    ob('o2', 'Refuser le tir hors cadre', 'zero_bavure'),
    ob('o5', 'Faire part de ses objections à l\'ordre de tir hors cadre et demander sa confirmation', 'personnalise', { target: 'objections_ordre_illegal', count: 1 }),
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
    ph('premier-obstacle', `Quatre obstacles, dix minutes`,
      `Minuit, boulevard Voltaire. Six cents mètres plus loin, vers la place de la République, un immeuble brûle ; entre lui et les pompiers, quatre obstacles. Le premier est une barricade de barrières et de mobilier de terrasse : vérification, annonce, lame. Derrière vous, les engins rouges suivent à vingt mètres.`,
      T(80), [
        rad('ÉPERVIER', 'CENTAURE 1', `Quatre obstacles jusqu'à l'immeuble. UN-ZÉRO minutes. Les pompiers vous suivent à DEUX-ZÉRO mètres : la mission, c'est eux, pas vous.`, 'A'),
        voix('OPÉRATEUR', `Premier obstacle : personne derrière, je confirme. Vas-y.`),
      ], [`Des projectiles tombent sur les engins des pompiers`]),
    ph('vehicule', `La voiture qui brûle au milieu`,
      `Deuxième obstacle : une voiture incendiée en travers du boulevard Voltaire, pneus en feu. On ne pousse pas un véhicule sans l'avoir vérifié, on ne s'arrête pas contre des flammes, et le Centaure n'éteint rien : il écarte la carcasse sur le côté, et les pompiers font le reste en passant.`,
      T(150), [
        voix('CHEF D\'ENGIN', `Change de siège avec moi : prends la tourelle, regarde s'il y a quelqu'un dedans. Je prends le volant pour la poussée.`),
        rad('SAPEUR 1', 'CENTAURE 1', `Écartez-moi la voiture vers la droite. Je l'arrose au passage, ne restez pas à côté.`),
      ], [`Un pneu éclate avec une détonation`, `Un engin incendiaire éclate sur le blindé`]),
    ph('verre', `Cinquante mètres de verre brisé`,
      `Troisième obstacle : un abribus et trois vitrines éclatés couvrent la chaussée du boulevard Voltaire de verre sur cinquante mètres. Pour vos roues, rien ; pour les pneus des fourgons de pompiers, c'est la crevaison assurée. La lame au ras du bitume, à trois kilomètres-heure, et un riverain qui appelle depuis un porche.`,
      T(120), [
        voix('RIVERAIN', `S'il vous plaît ! Ma mère est au troisième, dans l'immeuble qui brûle ! Dites-leur de se dépêcher !`),
        rad('SAPEUR 1', 'CENTAURE 1', `Je ne roule pas sur ce verre. Balayez-moi une voie à la lame, largeur de mon engin.`),
      ], [`Un riverain demande de l'aide depuis un porche`, `Retour de gaz sur le boulevard`]),
    ph('dernier-barrage', `Le dernier barrage`,
      `Quatrième obstacle, au bout du boulevard Voltaire, à cent mètres de l'immeuble en feu : des poubelles enflammées, gardées par une vingtaine d'individus qui visent les engins rouges. Une salve les disperserait ; la lame aussi, sans une grenade. Chaque salve inutile comptera, et un pompier blessé met fin à tout.`,
      OBJ('o1'), [
        rad('ÉPERVIER', 'CENTAURE 1', `Dernier obstacle, boulevard Voltaire. Salve possible sur votre demande si le peloton est pris à partie. Sinon, la lame.`),
        voix('CHEF D\'ENGIN', `Je te laisse le choix : tu pousses, ou tu me demandes une salve. Dis-moi pourquoi.`),
      ], [`Vingt individus visent les engins des pompiers`, `Un engin incendiaire tombe entre le blindé et le fourgon`]),
    ph('itineraire-ouvert', `Les engins rouges devant l'immeuble`,
      `L'itinéraire est ouvert sur toute la longueur du boulevard Voltaire. Les fourgons des pompiers dépassent le Centaure et se mettent en station devant l'immeuble ; la grande échelle se déploie. Vous reculez de trente mètres pour leur laisser la place : la suite ne dépend plus de la lame.`,
      FIN, [
        rad('SAPEUR 1', 'CENTAURE 1', `En station devant l'immeuble. Tenez-moi l'axe derrière, que mes renforts puissent passer.`),
        rad('ÉPERVIER', 'CENTAURE 1', `Itinéraire ouvert. Rendez compte : salves tirées, état de l'engin.`),
      ]),
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
