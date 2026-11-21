/* =====================================================================================
 * Catalogue — CRS de base, suite (missions 7 à 12) : interpellation, relève de nuit, extincteur,
 * protection des secours. Réexportées par crs.ts, qui reste le point d'entrée du rôle.
 * ===================================================================================== */

import { crowd, fail, forces, FIN, intel, mission, OBJ, ob, os, ph, rad, T, voix } from './dsl';
import type { MissionSpec } from './dsl';

const STAGIAIRE: Pick<MissionSpec, 'role' | 'rank'> = { role: 'crs', rank: 'gardien_stagiaire' };
const GARDIEN: Pick<MissionSpec, 'role' | 'rank'> = { role: 'crs', rank: 'gardien' };

export const CRS_07 = mission({
  ...GARDIEN, poste: 'interpellation',
  id: 'crs-07-colonne-d-interpellation',
  title: 'Colonne d\'interpellation',
  pitch: 'Désigné par le drone, un lanceur de pavés est dans la foule : l\'extraire sans mouvement de foule et sans coup.',
  briefing: [
    `Faubourg Saint-Antoine, un cortège sauvage se disperse. Un individu qui a jeté plusieurs pavés sur la ligne est désigné par le drone, blotti dans un groupe de manifestants pacifiques. Votre groupe est équipé pour les interpellations : petit bouclier rond, menottes, aérosol lacrymogène.`,
    `Votre mission est d'extraire la cible désignée en moins de vingt secondes, avec trois binômes, sans provoquer de mouvement de foule et sans coup hors cadre. L'interpellation doit être suivie d'une fiche complète : heure, lieu, motif.`,
    `Colonne par deux derrière les boucliers. À l'ordre, le groupe se dirige vers la cible. Les interpellateurs sortent par une porte ouverte dans la ligne, saisissent l'individu à deux, l'amènent au sol sans coup, le menottent et le ramènent derrière les boucliers. La section couvre le retrait.`,
    `Une interpellation sans fait constaté n'a pas de valeur : vérifiez que le drone désigne le bon individu. Ne laissez pas vos collègues entourés. Aucun coup après maîtrise.`,
  ],
  type: 'interpellation_ciblee', place: 'Rue du Faubourg Saint-Antoine', timeOfDay: 18, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(500, 'pouvoir_achat', 0.4, 0.5, 0.1, { gilets_jaunes: 0.25, syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.25 },
    ['Rue du Faubourg Saint-Antoine', 'Place de la Bastille'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, drone: true, bravm: 1, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes, cortège sauvage en reflux.',
    'Un lanceur de pavés désigné ; une dizaine d\'individus autour de lui.',
    ['Rue du Faubourg Saint-Antoine', 'Place de la Bastille'],
    ['Confirmer la cible avec le drone', 'Prévoir un binôme de couverture', 'Remplir la fiche d\'interpellation']),
  phases: [
    ph('signalement', `Trois indices sur la fréquence`,
      `Rue du Faubourg Saint-Antoine, à deux cents mètres de la place de la Bastille. Le drone suit un homme qui vient de lancer trois pavés sur la ligne et qui s'est fondu dans un groupe de manifestants pacifiques : la radio égrène son signalement.`,
      T(90), [
        rad('ICARE', 'MISTRAL 1', `Objectif désigné : veste verte, bonnet noir, sac à dos gris. Auteur de TROIS jets de pavés sur la ligne, fait filmé. Il est à CENT mètres de vous, trottoir côté pair.`),
        voix('CHEF DE GROUPE', `Veste verte, bonnet noir, sac gris. Répétez-le-moi. On ne touche personne d'autre.`),
      ]),
    ph('approche', `Approche par le flanc`,
      `Le groupe se forme en colonne par deux derrière les boucliers et remonte le trottoir du faubourg Saint-Antoine, masqué par la ligne. La cible ne vous a pas vus : elle discute au milieu de familles, à vingt-cinq mètres de la porte que la ligne s'apprête à ouvrir.`,
      T(150), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Colonne par deux, progression derrière la ligne, côté pair. Porte à mon signal.`),
        rad('ICARE', 'MISTRAL 1', `Objectif toujours en place, il retire son bonnet. Des familles autour de lui, pas de complice visible.`),
      ], [`La cible se mêle à des familles`, `La cible retire son bonnet et change de veste`]),
    ph('porte', `Vingt secondes hors de la ligne`,
      `La ligne ouvre une porte d'un mètre cinquante au milieu de la rue du Faubourg Saint-Antoine. Le binôme sort, saisit l'individu à deux, l'amène au sol sans coup et le menotte : vingt secondes hors de la ligne, pas davantage.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Porte ouverte. Interpellateurs, sortez : DEUX-ZÉRO secondes hors de la ligne.`),
        voix('CHEF DE GROUPE', `Saisie à deux, au sol, menottes. Pas un coup : il y a trois téléphones qui filment.`),
      ], [`Six personnes tentent de libérer l'interpellé`, `Un téléphone filme la saisie à trois mètres`]),
    ph('retrait', `Retrait derrière les boucliers`,
      `L'individu est menotté. Le binôme le relève et le ramène par la porte, pendant que la section referme la ligne en travers de la rue du Faubourg Saint-Antoine. Une partie de la foule hue et suit le mouvement jusqu'aux fourgons, garés côté place de la Bastille.`,
      T(120), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Porte fermée. Conduisez l'interpellé au fourgon, la section couvre le retrait.`, 'T'),
        voix('CHEF DE GROUPE', `Palpation avant de le monter. Ce que tu trouves, tu me le montres et tu le notes.`),
      ], [`Une bouteille vole vers le binôme pendant le retrait`]),
    ph('fiche', `La fiche : fait, heure, lieu`,
      `Au fourgon, à l'écart du faubourg, l'officier de police judiciaire attend la fiche d'interpellation. Fait constaté, heure, lieu, objets trouvés à la palpation : chaque ligne doit être exacte, car c'est elle qui tiendra ou non devant le juge.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL 1', `Remettez l'interpellé et sa fiche à l'officier de police judiciaire, au point de regroupement. Heure et lieu du fait exigés.`),
        voix('OFFICIER DE POLICE JUDICIAIRE', `Qui l'a vu lancer, à quelle heure, d'où ? Si vous ne savez pas, n'inventez pas : écrivez ce que vous avez vu.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Interpeller la cible désignée en moins de vingt secondes', 'interpeller', { target: 'cible_drone', count: 1, seconds: 20 }),
    ob('o2', 'Remettre une fiche d\'interpellation exacte', 'personnalise', { target: 'fiche_interpellation', count: 1 }),
    os('o3', 'Ne blesser aucun tiers pendant l\'extraction', 'limiter_blesses', { max: 0 }),
    os('o4', 'Ne porter aucun coup, ni pendant la saisie ni après la maîtrise', 'zero_bavure'),
  ],
  failures: [fail('bavure_grave', 'Coup après maîtrise : enquête IGPN.'), fail('personnalise', 'Mauvaise personne interpellée : procédure nulle.')],
  randomEvents: ['Un manifestant tente de libérer la cible', 'La cible change de veste', 'Un journaliste filme de près', 'Retour de gaz'],
  unique: 'Le geste qui compte est celui qui suit : la fiche d\'interpellation conditionne la procédure.',
  difficulty: 3, chapter: 2, tags: ['interpellation'],
});

export const CRS_08 = mission({
  ...GARDIEN, poste: 'bouclier',
  id: 'crs-08-releve-en-retard',
  title: 'Relève en retard',
  pitch: 'Quarante minutes de ligne, des bras qui tremblent et une relève qui n\'arrive pas : l\'endurance est aussi un adversaire.',
  briefing: [
    `Rue Royale, manifestation interdite : le barrage tient depuis quarante minutes. Votre section est épuisée, le moral baisse. La section de relève a été retardée par un embouteillage de fourgons place de la Madeleine. La foule, elle, ne faiblit pas.`,
    `Votre mission est de tenir votre place jusqu'à la relève, de ne pas céder au découragement et de rendre compte de votre état. La fatigue diminue votre précision : le moindre geste de trop sous la pression se retournera contre vous.`,
    `Bouclier haut, respiration régulière, un œil sur votre voisin. Quand la relève arrive, vous passez la ligne en bon ordre et vous récupérez aux fourgons pendant deux minutes. Si le chef de groupe annonce un repli, exécutez-le sans courir.`,
    `Buvez à la relève, pas avant. Ne lâchez pas votre bouclier : un trou dans la ligne, même de trente secondes, sera exploité. Parlez à votre voisin pour rester éveillé.`,
  ],
  type: 'barrage', place: 'Rue Royale', timeOfDay: 17, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(700, 'pouvoir_achat', 0.45, 0.55, 0.08, { gilets_jaunes: 0.35, syndical: 0.2, etudiants: 0.15, black_bloc: 0.08, curieux: 0.22 },
    ['Place de la Madeleine', 'Rue Royale'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Sept cents personnes ; poussée régulière, jets sporadiques.',
    'Une cinquantaine d\'individus déterminés sur le flanc nord.',
    ['Rue Royale', 'Place de la Madeleine'],
    ['Économiser ses forces', 'Parler à son voisin', 'Signaler la fatigue à son chef']),
  phases: [
    ph('quarantieme-minute', `La quarantième minute`,
      `Rue Royale, entre la place de la Madeleine et la Concorde, le barrage tient depuis quarante minutes. Les bras tremblent sous les boucliers ; la foule, elle, ne faiblit pas : elle pousse par à-coups, recule, revient.`,
      T(180), [
        voix('CHEF DE GROUPE', `Respirez. Un œil sur le voisin : s'il flanche, vous me le dites avant qu'il tombe.`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Tenez. MISTRAL TROIS est en route pour la relève.`, 'T'),
      ], [`Jets de bouteilles par vagues sur la ligne`]),
    ph('accalmie', `L'accalmie, bouclier au pied`,
      `Les jets cessent d'un coup et la foule reflue de vingt mètres vers la place de la Madeleine. Le chef de groupe fait tourner les porteurs de bouclier un par un ; votre visière est rayée, et le bouclier de votre voisin porte une fissure qu'il n'a pas vue.`,
      T(150), [
        voix('CHEF DE GROUPE', `On tourne aux boucliers, un par un. Personne ne s'assoit.`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Rendez compte de l'état du groupe : blessés, boucliers, fatigue.`),
      ], [`Le bouclier de votre voisin est fissuré`]),
    ph('retard', `Relève retardée de six minutes`,
      `L'annonce tombe : la section de relève est bloquée place de la Madeleine, ses fourgons pris dans un embouteillage de véhicules de police. Six minutes de plus. Dans la rue Royale, la foule sent le flottement et se rapproche de nouveau.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `MISTRAL TROIS bloqué place de la Madeleine. Relève retardée de SIX minutes. Tenez sur place.`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Vous avez entendu : SIX minutes. On serre et on tient. Rendez compte de votre état.`),
      ], [`Un collègue pose un genou à terre, pris d'un malaise`, `Panne radio de soixante secondes`]),
    ph('seconde-vague', `La seconde vague, sur une ligne fatiguée`,
      `Une trentaine d'individus masqués profitent de la fatigue pour charger le milieu de la ligne, rue Royale, derrière une banderole renforcée. Un mortier d'artifice part à tir tendu. Il n'y a personne pour vous remplacer : il faut tenir encore.`,
      OBJ('o1'), [
        voix('CHEF DE GROUPE', `Serrez les rangs ! Boucliers hauts, on ne lâche rien avant la relève !`),
        rad('MISTRAL 1', 'MISTRAL', `Assaut sur le centre du barrage, TROIS-ZÉRO individus, mortiers à tir tendu. Je riposte, cadre violences et voies de fait. Où en est la relève ?`),
      ], [`Mortier d'artifice tiré à tir tendu sur la ligne`, `Un fourgon est pris pour cible à l'arrière du barrage`]),
    ph('passage-de-ligne', `Passage de ligne rue Royale`,
      `La section fraîche se présente enfin, alignée dix mètres derrière vous dans la rue Royale. Vous passez la ligne en bon ordre, par la droite, sans tourner le dos à la foule avant d'être couvert ; puis deux minutes de récupération aux fourgons.`,
      FIN, [
        rad('MISTRAL 3', 'MISTRAL', `En place derrière MISTRAL UN. Relève en cours, passage de ligne.`),
        voix('CHEF DE GROUPE', `On passe par la droite, sans courir. Vous boirez au fourgon, pas avant.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir la ligne jusqu\'à l\'arrivée de la relève', 'tenir_position', { place: 'Rue Royale', seconds: 600 }),
    ob('o2', 'Rendre compte de l\'état de la section à la radio', 'personnalise', { target: 'compte_rendu', count: 2 }),
    os('o3', 'Ne jamais baisser son bouclier plus de cinq secondes', 'personnalise', { target: 'bouclier_baisse', seconds: 5 }),
    os('o4', 'Passer la ligne en bon ordre à la relève', 'releve', { count: 1 }),
  ],
  failures: [fail('ligne_enfoncee', 'La ligne est percée pendant la fatigue.'), fail('joueur_hors_combat', 'Épuisé : hors de combat.')],
  randomEvents: ['Un collègue s\'effondre', 'Une panne radio de soixante secondes', 'Un mortier tombe à vos pieds', 'Un fourgon est incendié'],
  unique: 'L\'endurance vaut le courage : la fatigue décide du sort d\'une ligne bien plus que le nombre.',
  difficulty: 3, chapter: 2, tags: ['endurance', 'releve'],
});

export const CRS_09 = mission({
  ...STAGIAIRE, poste: 'extincteur',
  id: 'crs-09-couloir-de-vie',
  title: 'Couloir de vie',
  pitch: 'Un feu au premier étage, une rue pleine de monde et un couloir de trois mètres à garder libre pour les pompiers.',
  briefing: [
    `Rue Saint-Antoine, un feu s'est déclaré au premier étage d'un immeuble pendant un rassemblement. La foule, curieuse, bloque la chaussée. Les pompiers sont en route mais ne peuvent pas passer. Vous êtes gardien stagiaire dans un groupe de six.`,
    `Votre mission est d'ouvrir et de tenir un couloir de trois mètres cinquante de large pour les pompiers, d'écarter la foule sans violence et d'aider à évacuer les riverains par l'escalier. Vous n'avez pas à éteindre le feu : votre rôle est de laisser le passage.`,
    `En colonne par deux, écartez la foule avec la voix puis avec le bouclier. Placez-vous de part et d'autre du couloir. Aidez les riverains à descendre. Quand les pompiers sont installés, protégez leur lance contre les curieux.`,
    `Ne repoussez jamais une personne âgée par le bouclier. Un pompier à pied ne doit pas être gêné par un agent. Gardez le couloir libre jusqu'à la dernière lance.`,
  ],
  type: 'protection_secours', place: 'Rue Saint-Antoine', timeOfDay: 15, weather: 'clair', windFrom: 280, windSpeed: 2,
  crowd: crowd(300, '', 0.15, 0.2, 0, { curieux: 0.6, riverains: 0.3, familles: 0.1 },
    ['Rue Saint-Antoine', 'Place de la Bastille'], 0.3),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 3, samu: 1 }),
  intel: intel(
    'Trois cents curieux autour d\'un immeuble en feu ; ambiance inquiète.',
    'Aucun radical.', ['Rue Saint-Antoine'],
    ['Ouvrir un couloir de trois mètres cinquante', 'Aider les riverains', 'Protéger la lance des pompiers']),
  phases: [
    ph('fumee', `Fumée au premier étage`,
      `Rue Saint-Antoine, une fumée grise sort d'une fenêtre du premier étage, au-dessus d'un café. Trois cents curieux occupent la chaussée, téléphone levé, et reculent à peine quand une vitre éclate. Les engins des pompiers sont annoncés, mais la rue est bouchée.`,
      T(90), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Feu d'appartement rue Saint-Antoine. Périmètre de CINQ-ZÉRO mètres autour de l'immeuble, puis couloir pour les engins. Foule non hostile : la voix d'abord.`),
        voix('CHEF DE GROUPE', `Colonne par deux ! On écarte à la voix, les bras ouverts. Le bouclier, c'est seulement si on ne vous entend pas.`),
      ], [`Une vitre éclate au premier étage`]),
    ph('couloir', `Un couloir de la largeur d'un engin`,
      `Le groupe se déploie de part et d'autre de la chaussée de la rue Saint-Antoine et ouvre un couloir de trois mètres cinquante, depuis la place de la Bastille jusqu'au pied de l'immeuble. Les badauds filment, avancent, se replacent dans le passage dès qu'on a le dos tourné.`,
      T(180), [
        rad('SAPEUR 1', 'MISTRAL 1', `Premier engin à DEUX-ZÉRO-ZÉRO mètres, arrivée par la place de la Bastille. Il me faut TROIS mètres CINQ-ZÉRO de large jusqu'à la façade.`),
        voix('CURIEUX', `Je ne bouge pas, je filme ! C'est la rue, j'ai le droit !`),
      ], [`Un curieux se plante au milieu du couloir`, `Des riverains proposent leur aide pour tenir le passage`]),
    ph('cage-d-escalier', `Quatre riverains dans l'escalier`,
      `Les engins sont en place rue Saint-Antoine et la grande échelle se déploie contre la façade. Dans la cage d'escalier enfumée, des riverains descendent à tâtons ; vous les prenez au pied des marches et les accompagnez jusqu'au trottoir d'en face, hors du couloir.`,
      OBJ('o2'), [
        voix('SAPEUR-POMPIER', `On fait le feu, vous faites les gens ! Il en reste dans l'escalier, côté cour !`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Aidez à l'évacuation du hall et du café. Les évacués sont dirigés vers la place de la Bastille, jamais dans le couloir.`),
      ], [`Une personne âgée est bloquée au deuxième étage`, `Une bouteille de gaz est signalée dans la cage d'escalier`]),
    ph('derniere-lance', `Jusqu'à la dernière lance`,
      `Les quatre riverains sont dehors et regroupés vers la place de la Bastille. Les pompiers attaquent le feu depuis la rue Saint-Antoine : il reste à garder le couloir libre et à tenir les curieux à distance des tuyaux, jusqu'au repli de la dernière lance.`,
      FIN, [
        rad('SAPEUR 1', 'MISTRAL 1', `Feu attaqué par l'extérieur. Gardez-moi le couloir, et personne sur les tuyaux.`),
        voix('CHEF DE GROUPE', `On ne lâche pas le couloir tant qu'un tuyau traîne par terre.`),
      ], [`Un enfant séparé de ses parents cherche à repasser le périmètre`]),
  ],
  objectives: [
    ob('o1', 'Ouvrir et tenir un couloir de trois mètres cinquante', 'proteger_site', { target: 'couloir_secours', place: 'Rue Saint-Antoine' }),
    ob('o2', 'Évacuer les riverains par l\'escalier', 'evacuer', { target: 'riverain', count: 4 }),
    os('o3', 'Écarter la foule sans bousculer personne avec le bouclier', 'zero_bavure'),
    os('o4', 'Garder le couloir libre jusqu\'à la fin de l\'extinction', 'duree', { seconds: 900 }),
  ],
  failures: [fail('victime_non_secourue', 'Un riverain n\'est pas évacué à temps.'), fail('bavure_grave', 'Une personne âgée est blessée par un bouclier.')],
  randomEvents: ['Un curieux se plante au milieu du couloir', 'Une personne âgée est coincée à l\'étage', 'Un chat se sauve sur le toit', 'Une bouteille de gaz est signalée dans la cage d\'escalier'],
  unique: 'Aucun adversaire : on y apprend que le métier consiste aussi à ouvrir le passage aux autres.',
  difficulty: 2, chapter: 1, altRoles: ['secouriste'], tags: ['secours', 'feu', 'miroir'],
});

export const CRS_10 = mission({
  ...STAGIAIRE, poste: 'bouclier',
  id: 'crs-10-garde-de-nuit',
  title: 'Garde de nuit',
  pitch: 'Deux heures du matin place Beauvau : faire le guet autour du ministère, sous la pluie, sans que rien ne se passe.',
  briefing: [
    `Place Beauvau, à deux heures du matin. Le ministère de l'Intérieur est bouclé par des barrières. Il pleut doucement. Vous êtes en garde fixe avec votre groupe. Le quartier est désert. L'alerte ne vient que par la radio.`,
    `Votre mission est de rester vigilant jusqu'à la relève, de contrôler les rares passants, de signaler tout comportement suspect et de tenir votre poste sans vous distraire. Il n'y a pas de manifestation : c'est une mission de sécurisation de site.`,
    `Faites une ronde toutes les quinze minutes. Questionnez poliment les passants qui s'arrêtent trop longtemps. Un véhicule qui stationne devant la grille doit être signalé. Respectez les consignes de relève de poste.`,
    `Ne quittez pas le poste : s'en éloigner plus de quatre-vingt-dix secondes sans ordre est un abandon de poste. Ne répondez pas aux provocations d'un passant ivre. Filmer la voie publique n'est pas une infraction : au moindre doute, rendez compte au chef de poste avant d'agir.`,
  ],
  type: 'securisation', place: 'Place Beauvau', timeOfDay: 2, weather: 'pluie', windFrom: 250, windSpeed: 2, duration: 'courte',
  crowd: crowd(10, '', 0.02, 0.1, 0, { curieux: 1 }, [], 0.05),
  forces: forces({ sections: 1, fourgons: 3 }),
  intel: intel(
    'Une dizaine de passants dans la nuit ; quartier désert.',
    'Aucun signalement.', ['Place Beauvau', 'Rue du Faubourg Saint-Honoré'],
    ['Faire une ronde toutes les quinze minutes', 'Signaler tout véhicule stationné devant la grille', 'Rendre compte avant d\'agir']),
  phases: [
    ph('consignes', `Prise de consignes sous la pluie`,
      `Place Beauvau, deux heures du matin. Le gardien que vous relevez vous passe les consignes devant la grille du ministère : une ronde tous les quarts d'heure le long des barrières, les passants qui s'attardent, les véhicules qui stationnent.`,
      T(60), [
        voix('GARDIEN RELEVÉ', `Rien depuis minuit. Un livreur qui s'est trompé de rue, c'est tout. La ronde va de la rue du Faubourg-Saint-Honoré à l'avenue de Marigny.`),
        rad('CENTRAL', 'MISTRAL 1', `Contrôle radio.`),
      ]),
    ph('premiere-ronde', `Première ronde le long de la grille`,
      `La place est vide, la pluie fine fait briller les barrières. Vous longez la grille de la rue du Faubourg Saint-Honoré à l'avenue de Marigny ; un scooter de livraison ralentit devant le poste, hésite, repart.`,
      T(120), [
        voix('CHEF DE POSTE', `Ce qui stationne devant la grille, tu me le signales. Ce qui passe, tu le regardes passer.`),
      ], [`Un livreur à scooter ralentit devant le poste`, `Un passant ivre insulte les agents depuis le trottoir d'en face`]),
    ph('homme-au-telephone', `Un homme filme la grille`,
      `Un homme s'est arrêté face à l'entrée, place Beauvau, et filme la grille avec son téléphone depuis plusieurs minutes. Il ne commet aucune infraction : il vous revient de l'aborder, de lui parler poliment et d'en rendre compte à la radio.`,
      OBJ('o2'), [
        voix('CHEF DE POSTE', `Filmer la rue, c'est son droit. Tu vas lui parler, tu ne touches pas au téléphone, et tu me rends compte.`),
        voix('PASSANT', `Je filme ce que je veux, non ? C'est un bâtiment public. Vous allez me demander mes papiers ?`),
      ], [`L'éclairage de la place s'éteint pendant quarante secondes`]),
    ph('banderole', `Dix personnes et une banderole`,
      `Le signalement est passé. Par la rue des Saussaies, une dizaine de personnes approchent en silence avec une banderole roulée, s'arrêtent à vingt mètres des barrières et la déploient face au ministère. Aucune n'essaie de passer.`,
      T(150), [
        rad('CENTRAL', 'MISTRAL 1', `Reçu pour l'individu au téléphone. Un groupe de UN-ZÉRO personnes arrive par la rue des Saussaies avec une banderole. Présence seulement, rendez compte de leur attitude.`),
        voix('CHEF DE POSTE', `Ils sont sur le trottoir, ils ont le droit d'y être. On reste derrière les barrières et on regarde.`),
      ], [`Un sac est abandonné au pied d'une barrière`]),
    ph('releve-de-poste', `Les consignes à celui qui prend la suite`,
      `Le fourgon de la relève se gare rue des Saussaies. Vous passez les consignes au gardien qui prend votre place devant la grille : rondes faites, personnes abordées, faits signalés, sans rien arranger.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL 1', `Votre relève arrive par la rue des Saussaies. Passez les consignes.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir le poste jusqu\'à la relève', 'proteger_site', { place: 'Place Beauvau', seconds: 420 }),
    ob('o2', 'Signaler le passant suspect à la radio', 'reperer_signaux', { count: 1 }),
    os('o3', 'Effectuer trois rondes complètes le long de la grille', 'personnalise', { target: 'ronde', count: 3 }),
    os('o4', 'Aborder avec courtoisie deux passants qui s\'attardent', 'prevention', { target: 'passant', count: 2 }),
  ],
  failures: [fail('personnalise', 'Poste abandonné plus de quatre-vingt-dix secondes.', 90), fail('bavure_grave', 'Un passant est malmené sans motif.')],
  randomEvents: ['Un passant ivre insulte les agents', 'Un livreur ralentit devant la grille', 'Une alarme se déclenche dans la rue voisine', 'Un chat saute sur une barrière'],
  unique: 'Une mission où il ne se passe presque rien : l\'ennui est le danger.',
  difficulty: 1, chapter: 1, tags: ['garde', 'nuit', 'debutant'],
});

export const CRS_11 = mission({
  ...GARDIEN, poste: 'extincteur',
  id: 'crs-11-second-rang',
  title: 'Second rang',
  pitch: 'Cinq minutes sous les jets enflammés, deux poubelles à éteindre et la façade de l\'immeuble à ne pas laisser brûler.',
  briefing: [
    `Avenue de l'Opéra, fin d'un défilé de contestation. Un groupe de casseurs lance des projectiles enflammés sur votre ligne. Des poubelles brûlent devant une devanture de bijouterie. Vous êtes extincteur : vous opérez au second rang, derrière les boucliers.`,
    `Votre mission est de tenir cinq minutes sans qu'aucun collègue ne soit brûlé et d'éteindre deux poubelles avant qu'elles ne propagent le feu à la façade. Un extincteur suffit pour un petit feu, mais pas pour un véhicule embrasé.`,
    `À l'ordre, avancez derrière deux boucliers jusqu'au feu, éteignez, reculez. Vous n'avez pas à quitter la couverture plus de dix secondes. Si un cocktail incendiaire touche un collègue, passez immédiatement à son extinction.`,
    `Un agent brûlé passe avant la poubelle, toujours. Ne visez pas les flammes : visez la base du feu, par un balayage lent. Gardez votre masque à portée de main et prévenez votre chef avant de vider l'extincteur.`,
  ],
  type: 'protection_secours', place: 'Avenue de l\'Opéra', timeOfDay: 18.5, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.5, 0.65, 0.15, { black_bloc: 0.2, gilets_jaunes: 0.3, etudiants: 0.2, curieux: 0.3 },
    ['Avenue de l\'Opéra', 'Place de l\'Opéra', 'Rue de la Paix'], 0.35),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; groupes mobiles, jets de projectiles enflammés.',
    'Une cinquantaine d\'individus déterminés, munis d\'engins incendiaires.',
    ['Avenue de l\'Opéra', 'Rue de la Paix'],
    ['Rester derrière les boucliers', 'Éteindre d\'abord les agents brûlés', 'Appeler les pompiers pour les véhicules']),
  phases: [
    ph('premieres-flammes', `Les premières flammes sur la chaussée`,
      `Au second rang, trois mètres derrière les boucliers, vous portez l'extincteur de la section. Les premiers engins incendiaires éclatent sur la chaussée de l'avenue de l'Opéra, à dix mètres de la ligne ; devant une bijouterie, deux poubelles renversées commencent à brûler.`,
      T(100), [
        voix('CHEF DE GROUPE', `Extincteur, tu restes collé à moi. Un collègue qui brûle passe avant tout le reste.`),
        rad('MISTRAL 1', 'MISTRAL', `Engins incendiaires sur le barrage, avenue de l'Opéra. J'emploie la force d'initiative, cadre violences et voies de fait.`),
      ], [`Jets d'engins incendiaires devant la ligne`]),
    ph('deux-poubelles', `Deux poubelles devant la bijouterie`,
      `Le feu des poubelles lèche le rideau de fer de la bijouterie et une fumée noire couvre la moitié de l'avenue de l'Opéra. À l'ordre, vous sortez derrière deux boucliers, vous balayez la base des flammes, vous reculez : dix secondes dehors, pas davantage.`,
      OBJ('o2'), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Extincteur sur les poubelles, deux boucliers en protection. UN-ZÉRO secondes hors de la ligne, pas plus.`),
        voix('CHEF DE GROUPE', `Balayage lent, à la base ! Et tu me préviens avant d'être à sec.`),
      ], [`Une bouteille enflammée éclate à deux mètres du porte-extincteur`, `Un touriste est pris au milieu de l'avenue`]),
    ph('collegue-touche', `Un collègue en flammes`,
      `Les deux poubelles ne sont plus que de la fumée. Un engin incendiaire éclate alors sur le bouclier d'un collègue du premier rang, à votre gauche : les flammes courent sur sa manche et sa jambe, et il lâche la ligne de l'avenue de l'Opéra en hurlant.`,
      OBJ('o1'), [
        voix('COLLÈGUE', `Je brûle ! La jambe, la jambe !`),
        rad('MISTRAL 1', 'CENTRAL', `URGENT. UN agent touché par un engin incendiaire, avenue de l'Opéra, avant la place de l'Opéra. Demande SANTÉ sur place.`),
      ], [`Un engin incendiaire atteint un agent du premier rang`, `Un second engin éclate sur un fourgon`]),
    ph('fourgon', `Le fourgon, trop gros pour un extincteur`,
      `La ligne a tenu cinq minutes sous les flammes. Derrière elle, un fourgon touché brûle franchement à l'angle de la rue des Petits Champs : un extincteur n'y suffira pas. Il faut le dire, faire appeler les pompiers et leur garder le passage.`,
      T(180), [
        rad('CENTRAL', 'MISTRAL 1', `SAPEUR UN engagé pour le fourgon en feu, arrivée par la rue des Petits Champs, QUATRE minutes.`),
        voix('CHEF DE GROUPE', `Un véhicule, tu ne l'éteins pas avec ça. Tu gardes ta poudre pour les collègues.`),
      ], [`L'extincteur se bloque : la goupille est faussée`]),
    ph('braises', `Les braises de l'avenue`,
      `Les casseurs refluent vers la place de l'Opéra en laissant des braises sur la chaussée de l'avenue. Il reste à traiter ce qui fume encore, puis à accompagner le collègue touché jusqu'à l'ambulance.`,
      FIN, [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Ils refluent. Extincteur, traitez les derniers foyers, puis accompagnez le blessé à SANTÉ UN.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir cinq minutes sous les jets sans collègue brûlé grave', 'tenir_position', { place: 'Avenue de l\'Opéra', seconds: 300 }),
    ob('o2', 'Éteindre deux poubelles avant qu\'elles ne gagnent la façade', 'eteindre', { target: 'poubelle', count: 2 }),
    os('o3', 'Éteindre en moins de trois secondes les flammes sur un agent touché', 'secourir', { target: 'agent_en_flammes', count: 1, seconds: 3 }),
    os('o4', 'Ne pas se découvrir plus de dix secondes d\'affilée', 'personnalise', { target: 'exposition_sans_couverture', seconds: 10 }),
  ],
  failures: [fail('personnalise', 'La façade prend feu.'), fail('trop_de_blesses', 'Trop d\'agents brûlés.', 3)],
  randomEvents: ['Un collègue touché par les flammes appelle à l\'aide', 'Un cocktail éclate sur un fourgon', 'Panne de l\'extincteur', 'Un touriste pris au milieu de la rue'],
  unique: 'Le feu comme adversaire direct : le second rang est le plus exposé aux flammes.',
  difficulty: 3, chapter: 2, tags: ['extincteur', 'cocktails'],
});

export const CRS_12 = mission({
  ...GARDIEN, poste: 'interpellation',
  id: 'crs-12-vingt-secondes',
  title: 'Vingt secondes',
  pitch: 'Sous les arcades de la rue de Rivoli, trois sorties, trois auteurs, trois fiches justes : vingt secondes par interpellation.',
  briefing: [
    `Rue de Rivoli, sous les arcades. Un cortège sauvage de quelques dizaines de personnes remonte la rue en brisant des vitrines. Le drone désigne trois individus. Votre binôme d'interpellation est chargé de les sortir. Vous travaillez avec un partenaire, tous deux protégés par un petit bouclier.`,
    `Votre mission est de sortir trois fois du rang, d'interpeller trois auteurs filmés par le drone, de les remettre à l'officier de police judiciaire avec trois fiches justes, en moins de vingt secondes par sortie.`,
    `Colonne par deux sous les arcades. À l'ordre, sortez, saisissez à deux, menottez, rentrez. Le groupe couvre votre sortie. Identifiez-vous à voix haute. Le partenaire tient la caméra-piéton. La fiche se remplit à la fin de chaque sortie, avant de repartir.`,
    `Les arcades sont étroites : une foule de passants peut vous coincer. Ne vous séparez jamais de votre binôme. Si l'individu est mêlé à des familles, renoncez et signalez-le au chef.`,
  ],
  type: 'interpellation_ciblee', place: 'Rue de Rivoli', timeOfDay: 19, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, '', 0.45, 0.6, 0.2, { black_bloc: 0.25, curieux: 0.4, fetards: 0.15, gilets_jaunes: 0.2 },
    ['Rue de Rivoli', 'Rue de Castiglione'], 0.2),
  forces: forces({ sections: 2, fourgons: 6, drone: true, bravm: 1, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents personnes en cortège sauvage, sous les arcades.',
    'Une soixantaine d\'individus encagoulés, trois auteurs désignés.',
    ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Travailler en binôme', 'Remplir chaque fiche immédiatement', 'Renoncer si l\'individu est mêlé à des familles']),
  phases: [
    ph('colonne-sous-les-arcades', `En colonne sous les arcades`,
      `Rue de Rivoli, un cortège sauvage de quelques dizaines de personnes remonte la rue en brisant des vitrines. Votre binôme d'interpellation progresse en colonne par deux derrière le groupe, petit bouclier au bras, entre les piliers des arcades et les étals des boutiques de souvenirs.`,
      T(120), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Cortège sauvage rue de Rivoli, vitrines brisées. Interpellateurs en colonne sous les arcades. Sortie sur désignation d'ICARE uniquement.`),
        voix('BINÔME', `Je prends la caméra, tu prends les menottes. On sort ensemble, on rentre ensemble.`),
      ], [`Des passants se réfugient sous les arcades et encombrent le passage`]),
    ph('premiere-sortie', `Première sortie : veste noire, capuche grise`,
      `Le drone désigne la première cible à trente mètres, devant une vitrine étoilée de la rue de Rivoli. Vous sortez de la colonne avec votre binôme, vous saisissez à deux, vous menottez et vous rentrez sous les arcades : vingt secondes, pas davantage.`,
      T(150), [
        rad('ICARE', 'MISTRAL 1', `Objectif UN : veste noire, capuche grise, vient de briser une vitrine au marteau. À TROIS-ZÉRO mètres de votre tête de colonne, côté arcades. Fait filmé.`),
        voix('CHEF DE GROUPE', `Interpellateurs, sortez ! Vingt secondes !`),
      ], [`La cible lance une bouteille en vous voyant sortir`]),
    ph('fiche-entre-deux', `La fiche avant de repartir`,
      `Sous les arcades de la rue de Rivoli, à l'abri d'un pilier, chaque sortie se termine par une fiche : fait constaté, heure, lieu, référence de la séquence filmée. Le cortège, lui, continue d'avancer vers la rue de Castiglione.`,
      T(90), [
        voix('CHEF DE GROUPE', `La fiche maintenant, pas ce soir. Dans dix minutes, tu ne sauras plus lequel a fait quoi.`),
        rad('ICARE', 'MISTRAL 1', `Le groupe tourne dans la rue de Castiglione. Deux autres auteurs identifiés, je les garde en visuel.`),
      ], [`La caméra-piéton du binôme s'éteint`]),
    ph('deux-autres', `Deux autres auteurs, rue de Castiglione`,
      `Le cortège sauvage a tourné dans la rue de Castiglione, vers la place Vendôme. Le drone désigne deux autres auteurs coup sur coup ; l'un d'eux marche au milieu de familles sorties d'un hôtel, et les arcades sont si étroites qu'un attroupement de passants suffirait à vous coincer.`,
      OBJ('o1'), [
        rad('ICARE', 'MISTRAL 1', `Objectif DEUX : blouson rouge, casque de vélo, à DEUX-ZÉRO mètres. Objectif TROIS : sweat kaki, parapluie noir, mêlé à des familles.`),
        voix('BINÔME', `Le troisième est au milieu des gosses. On renonce, ou on attend qu'il s'écarte ?`),
      ], [`Un groupe de familles passe entre vous et la cible`, `La cible change de veste sous un porche`]),
    ph('remise', `Trois fiches pour l'officier de police judiciaire`,
      `Trois auteurs sont menottés et assis dans le fourgon, garé à l'angle de la rue de Castiglione. L'officier de police judiciaire prend les fiches une à une et les compare aux images du drone : une heure fausse, un lieu approximatif, et la procédure tombe.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL 1', `Présentez les interpellés à l'officier de police judiciaire avec les fiches et les références des séquences d'ICARE.`),
        voix('OFFICIER DE POLICE JUDICIAIRE', `Celui-là, vous l'avez vu briser la vitrine, ou c'est le drone qui l'a vu ? Ce n'est pas la même ligne sur le procès-verbal.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Interpeller trois auteurs désignés par le drone', 'interpeller', { count: 3 }),
    ob('o2', 'Remettre trois fiches complètes et justes', 'personnalise', { target: 'fiche_interpellation', count: 3 }),
    os('o3', 'Chaque sortie en moins de vingt secondes', 'duree', { seconds: 20 }),
    os('o4', 'Ne jamais s\'éloigner de plus de cinq mètres de son binôme', 'personnalise', { target: 'distance_binome', max: 5 }),
  ],
  failures: [fail('bavure_grave', 'Procédure nulle faute de fait constaté.'), fail('joueur_hors_combat', 'Binôme isolé et pris à partie.')],
  randomEvents: ['Un passant se plante dans l\'arcade', 'La cible change de veste', 'Un cortège de familles passe à proximité', 'La caméra-piéton s\'éteint'],
  unique: 'Le geste est court, la procédure est longue : une fiche fausse ruine une interpellation parfaite.',
  difficulty: 3, chapter: 2, altRoles: ['journaliste', 'gendarme_centaure'], tags: ['interpellation', 'arcades', 'miroir'],
});
