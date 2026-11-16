/* =====================================================================================
 * Catalogue — opérateur du canon à eau (engin lanceur d'eau « NEPTUNE ») : gradation de l'eau,
 * extinction des feux de rue, protection des tiers. Détachement facultatif (chapitre 10).
 * C'est le canon à eau qui éteint, pas le Centaure.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';

const OPE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'operateur_canon_eau', rank: 'gardien', poste: 'operateur' };
const COND: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'operateur_canon_eau', rank: 'gardien', poste: 'conducteur' };

export const EAU_01 = mission({
  ...OPE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 10,
  id: 'canon-01-dix-mille-litres',
  title: 'Dix mille litres',
  pitch: 'Apprendre la tourelle du canon à eau : pluie, jet diffus, jet droit, et économiser une cuve de dix mille litres.',
  briefing: [
    `Place de l'Alma, un matin froid. Un engin lanceur d'eau est garé devant le moniteur, cuve pleine, dix mille litres. Des cibles en carton jouent la foule. Aucune personne n'est présente. Vous apprenez la tourelle.`,
    `Votre mission est de maîtriser les trois modes de jet : la pluie, le jet diffus et le jet droit, de viser une cible à trente mètres, de gérer la consommation et de ne pas viser la tête. Vous êtes opérateur : le conducteur reste à son poste.`,
    `La pluie arrose large sans force ; le diffus repousse sans blesser ; le jet droit est interdit à moins de quinze mètres. Gardez le jet bas. Contrôlez le débit : à pleine puissance, les dix mille litres partent en onze minutes. Annoncez « Eau ! » avant de tirer.`,
    `Ne visez jamais la tête : un jet haut est une faute grave. Au moindre doute, réduisez le débit. Ne mouillez pas les câbles électriques.`,
  ],
  place: 'Place de l\'Alma', timeOfDay: 9, weather: 'clair', windFrom: 270, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ canonEau: 1 }),
  intel: intel('Cibles en carton, aucune foule.', 'Aucun signalement.', ['Place de l\'Alma'],
    ['Garder le jet bas', 'Compter les litres', 'Annoncer avant de tirer']),
  phases: [
    ph('pluie', 'La pluie', 'Vous arrosez large en jet de pluie.', T(60),
      [['VOUS', 'Mode pluie, arrosage large.']], []),
    ph('diffus', 'Le jet diffus', 'Vous passez au diffus sur les cibles.', T(120),
      [['MONITEUR', 'Passez au jet diffus.']], ['Un cône est renversé']),
    ph('droit', 'Le jet droit', 'Vous tirez en jet droit à trente mètres, jet bas.', FIN,
      [['VOUS', 'Jet droit à trente mètres, jet bas. Reste six mille litres.']], []),
  ],
  objectives: [
    ob('o1', 'Toucher trois cibles à trente mètres avec le jet droit', 'personnalise', { target: 'cible_carton', count: 3 }),
    ob('o2', 'Garder plus de quatre mille litres après l\'exercice', 'personnalise', { target: 'reserve_eau', count: 4000 }),
    os('o3', 'Ne jamais viser la tête', 'zero_bavure'),
  ],
  failures: [fail('bavure_grave', 'Jet haut : faute grave.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Une cible tombe', 'Le moniteur change la distance'],
  unique: 'Trois jets pour un seul engin : savoir choisir la bonne gradation.',
  tags: ['formation', 'eau'],
});

export const EAU_02 = mission({
  ...OPE, type: 'manifestation_declaree', difficulty: 3, chapter: 10,
  id: 'canon-02-premiere-pluie',
  title: 'Première pluie',
  pitch: 'Après les sommations, vider la place de la Bastille par gradation : pluie, diffus, jet droit — aucune chute, aucun jet haut.',
  briefing: [
    `Place de la Bastille, fin de manifestation. Quatre cents personnes refusent de se disperser malgré les sommations ; une trentaine jettent des bouteilles. Le commandant a autorisé l'emploi de l'engin lanceur d'eau. Le vent d'ouest est faible.`,
    `Vous êtes opérateur : votre mission est de vider la place par gradation, en commençant par la pluie, puis le diffus, et le jet droit seulement en dernier recours. Aucune chute, aucun jet haut, aucun tiers touché.`,
    `Annoncez « Attention, usage du canon à eau. Reculez. » par le haut-parleur de l'engin. Pluie sur les premières lignes, diffus sur les groupes qui résistent, jet droit sur ceux qui lancent des projectiles, et sur eux seulement. Gardez le jet bas. Observez la foule : la gradation est faite pour être suivie.`,
    `L'eau fait glisser : une chute sur le pavé est une blessure. Ne visez jamais un journaliste ou un poste de soins. Un jet droit à moins de quinze mètres est interdit.`,
  ],
  place: 'Place de la Bastille', timeOfDay: 19, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(400, 'pouvoir_achat', 0.5, 0.55, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.2 },
    ['Place de la Bastille', 'Boulevard Henri IV', 'Rue de Lyon'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; une trentaine de lanceurs de bouteilles.',
    'Une trentaine d\'individus déterminés autour de la colonne de Juillet.', ['Place de la Bastille', 'Boulevard Henri IV'],
    ['Commencer par la pluie', 'Garder le jet bas', 'Épargner journalistes et soignants']),
  phases: [
    ph('sommations', 'Sommations', 'Le commandant prononce les sommations.', T(180),
      [['MISTRAL', 'NEPTUNE UN ICI MISTRAL. Dernière sommation faite. Emploi de la force autorisé : engin lanceur d\'eau, en commençant par la pluie. FAITES L\'APERÇU.'], ['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. APERÇU. TERMINÉ.']], []),
    ph('pluie', 'Pluie', 'Vous arrosez en pluie sur les premières lignes.', T(360),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Mode pluie sur la ligne de tête. PARLEZ.']], ['Un manifestant glisse sur le pavé mouillé']),
    ph('diffus', 'Diffus puis jet droit', 'Vous passez au diffus sur les résistants.', TENS(0.55),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Jet diffus, reste SEPT MILLE litres. PARLEZ.']], []),
    ph('fin', 'Place vidée', 'La place est dégagée.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Place vidée, aucune chute. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Vider la place de la Bastille par gradation', 'disperser', { place: 'Place de la Bastille' }),
    ob('o2', 'Ne causer aucune chute ni jet haut', 'zero_bavure'),
    os('o3', 'Garder plus de cinq mille litres', 'personnalise', { target: 'reserve_eau', count: 5000 }),
    os('o4', 'Épargner les journalistes et les soignants', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Jet à la tête.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Un manifestant glisse', 'Un journaliste dans la ligne de tir', 'Pression d\'eau en baisse', 'Retour de brume sur la place'],
  unique: 'Gradation : l\'eau est une force qui se dose, et se juge à l\'effet, pas à la puissance.',
  altRoles: ['journaliste', 'manifestant'], tags: ['gradation', 'miroir'],
});

export const EAU_03 = mission({
  ...OPE, type: 'protection_secours', difficulty: 3, chapter: 10,
  id: 'canon-03-barricade-en-feu',
  title: 'Barricade en feu',
  pitch: 'Une barricade de vélos électriques et de palettes brûle devant la ligne : l\'éteindre pour les pompiers, sous les jets de projectiles.',
  briefing: [
    `Rue Réaumur, nuit tombante. Une barricade de huit mètres de large brûle : palettes, poubelles et une dizaine de vélos et trottinettes en libre-service dont les batteries crépitent. Les pompiers ne peuvent pas approcher à cause des jets. Le canon à eau est le seul moyen d'éteindre.`,
    `Votre mission est d'éteindre la barricade avant qu'elle ne gagne la façade voisine, de protéger l'équipage des projectiles et de laisser le passage aux pompiers. Vous êtes opérateur : un extincteur ne suffit pas pour les batteries.`,
    `Arrosez le pied de la barricade en jet diffus. Les batteries se rallument parfois sous deux minutes : revenez dessus. Ne vous exposez pas à plus de dix secondes. Après extinction, laissez les pompiers refroidir.`,
    `Les batteries projettent des étincelles à trois mètres : restez dans la cabine grillagée. N'utilisez pas le jet droit sur une façade. Ne gaspillez pas l'eau : il vous reste quatre mille litres.`,
  ],
  place: 'Rue Réaumur', timeOfDay: 20, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, '', 0.55, 0.7, 0.3, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Rue Réaumur', 'Boulevard de Sébastopol'], 0.15),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, pompiers: 2, samu: 1 }),
  intel: intel(
    'Trois cents personnes ; une barricade en feu et des jets de projectiles.',
    'Une soixantaine d\'individus déterminés.', ['Rue Réaumur', 'Boulevard de Sébastopol'],
    ['Éteindre en jet diffus', 'Revenir sur les batteries', 'Protéger l\'équipage']),
  phases: [
    ph('feu', 'Barricade en feu', 'La barricade brûle depuis cinq minutes.', T(120),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Éteignez la barricade en feu, puis jet diffus devant la ligne, sur mon ordre. PARLEZ.']], []),
    ph('extinction', 'Extinction', 'Vous arrosez le pied de la barricade.', T(300),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. REÇU. Reste QUATRE MILLE litres. TERMINÉ.']], ['Étincelles de batteries sur la tourelle']),
    ph('rallumage', 'Rallumage', 'Les batteries se rallument sous deux minutes.', TENS(0.65),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Rallumage, je reviens dessus. PARLEZ.']], []),
    ph('fin', 'Refroidissement', 'Les pompiers refroidissent la barricade.', FIN, [['SANTÉ 1', 'NEPTUNE UN ICI SANTÉ UN. Nous prenons le relais. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Éteindre la barricade avant qu\'elle ne gagne une façade', 'eteindre', { target: 'barricade_electrique', count: 1 }),
    ob('o2', 'Traiter les rallumages des batteries', 'eteindre', { target: 'rallumage', count: 2 }),
    os('o3', 'Garder plus de deux mille litres', 'personnalise', { target: 'reserve_eau', count: 2000 }),
    os('o4', 'Protéger l\'équipage des projectiles', 'survivre'),
  ],
  failures: [fail('personnalise', 'La façade voisine prend feu.'), fail('joueur_hors_combat', 'Équipage hors de combat.')],
  randomEvents: ['Étincelles de batteries', 'Un jet de cocktail sur l\'engin', 'Pression d\'eau en baisse', 'Un pompier demande de l\'eau'],
  unique: 'Les batteries se rallument : l\'eau, et non l\'extincteur, est la réponse.',
  tags: ['feu', 'batteries'],
});

export const EAU_04 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-04-le-pont-d-iena',
  title: 'Le pont d\'Iéna',
  pitch: 'Tenir le pont d\'Iéna avec un canon à eau en deuxième ligne : le pont est le piège de la Seine.',
  briefing: [
    `Pont d'Iéna, manifestation interdite. Près d'un millier de personnes veulent atteindre la Tour Eiffel depuis le Trocadéro. Le pont, large de trente-cinq mètres, est le seul accès. Votre engin est à l'arrière de la ligne de barrage.`,
    `Vous êtes opérateur : votre mission est d'appuyer la ligne sans gaz, d'utiliser l'eau en dernier recours après les sommations, de garder le pont ouvert à la retraite et de ne causer aucune chute dans l'eau.`,
    `La ligne tient la tête de pont. Vous êtes en retrait à vingt mètres. Au premier assaut, jet diffus à vingt mètres. En dernier recours, jet droit à trente mètres sur ceux qui lancent des projectiles. Gardez toujours un couloir de retraite vers le quai.`,
    `Le pont est étroit : une foule en fuite est un danger. Le jet est interdit à moins de vingt mètres de la balustrade. Ne poussez jamais la foule vers l'eau.`,
  ],
  place: 'Pont d\'Iéna', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 4,
  crowd: crowd(900, 'libertes', 0.5, 0.65, 0.12, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.1, curieux: 0.4 },
    ['Place du Trocadéro et du 11 Novembre', 'Pont d\'Iéna', 'Quai Branly'], 0.55),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Neuf cents personnes ; un goulot sur un pont de trente-cinq mètres.',
    'Une centaine d\'individus déterminés en tête.', ['Pont d\'Iéna', 'Place du Trocadéro et du 11 Novembre'],
    ['Garder un couloir de retraite', 'Ne pas pousser vers l\'eau', 'Jet bas']),
  phases: [
    ph('pose', 'Mise en place', 'La ligne tient la tête de pont ; vous êtes en retrait.', T(240),
      [['MISTRAL', 'NEPTUNE UN ICI MISTRAL. Nous tenons le pont d\'Iéna. Vous restez derrière la ligne : l\'eau en dernier recours, sur mon ordre. PARLEZ.']], []),
    ph('assaut', 'Assaut', 'Un groupe attaque la ligne.', TENS(0.55),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Jet diffus sur le groupe de tête, reste HUIT MILLE litres. PARLEZ.']], ['Un manifestant tombe près de la balustrade']),
    ph('densite', 'Densité critique', 'La foule se serre sur le pont.', FOULE('dispersion'),
      [['ICARE', 'CENTRAL ICI ICARE. Densité critique devant le barrage, plus de QUATRE personnes au mètre carré. PARLEZ.']], []),
    ph('fin', 'Reflux', 'La foule reflue vers le Trocadéro.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Pont tenu. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Tenir le pont d\'Iéna avec l\'appui de l\'eau', 'tenir_position', { place: 'Pont d\'Iéna', seconds: 900 }),
    ob('o2', 'Ne causer aucune chute dans la Seine', 'limiter_blesses', { max: 0 }),
    os('o3', 'Laisser un couloir de retraite libre', 'proteger_site', { target: 'couloir_retraite' }),
    os('o4', 'Employer l\'eau en dernier recours', 'zero_bavure'),
  ],
  failures: [fail('victime_non_secourue', 'Une personne tombe dans la Seine.'), fail('trop_de_blesses', 'Bousculade grave.', 8)],
  randomEvents: ['Un manifestant près de la balustrade', 'Pression d\'eau en baisse', 'Un journaliste dans le jet', 'Vent tournant'],
  unique: 'Un pont, la Seine à côté : l\'eau est ici une arme à manier avec une extrême prudence.',
  tags: ['pont', 'seine'],
});

export const EAU_05 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 3, chapter: 10,
  id: 'canon-05-deux-degres',
  title: 'Deux degrés',
  pitch: 'Manifestation interdite par grand froid : l\'eau gèle, la chaussée devient une patinoire et chaque litre est un risque.',
  briefing: [
    `Place du Trocadéro, mi-décembre, deux degrés et un vent glacial. Un rassemblement interdit de mille personnes occupe l'esplanade. Une couche de givre recouvre le pavé. La chaussée gèle sous l'eau.`,
    `Vous êtes opérateur : votre mission est de dire à votre commandant si l'eau est compatible avec le froid. Sous cinq degrés, un jet d'eau sur le pavé peut causer des chutes graves. Vous justifiez chaque usage et, au besoin, vous faites part de vos objections.`,
    `Contrôlez la température. Utilisez la pluie en dernier recours. Préférez la présence à la force. Si des chutes se produisent, cessez et demandez les secours. Tenez le journal horodaté de chaque décision.`,
    `Un jet d'eau à deux degrés sur la chaussée est un danger : refuser est possible et, parfois, nécessaire. Ne mouillez pas la chaussée à l'arrière de la foule. Les personnes âgées sont à protéger.`,
  ],
  place: 'Place du Trocadéro et du 11 Novembre', timeOfDay: 15, weather: 'brouillard', windFrom: 30, windSpeed: 6,
  crowd: crowd(1000, 'libertes', 0.35, 0.45, 0.06, { militants: 0.3, gilets_jaunes: 0.3, familles: 0.15, curieux: 0.25 },
    ['Place du Trocadéro et du 11 Novembre', 'Jardins du Trocadéro'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille personnes sur l\'esplanade ; froid vif, ambiance contenue.',
    'Aucun bloc ; quelques radicaux isolés.', ['Place du Trocadéro et du 11 Novembre', 'Jardins du Trocadéro'],
    ['Éviter l\'eau sous cinq degrés', 'Préférer la présence', 'Tenir un journal de décisions']),
  phases: [
    ph('froid', 'Rassemblement par grand froid', 'Le givre recouvre l\'esplanade.', T(240),
      [['MISTRAL', 'NEPTUNE UN ICI MISTRAL. Température DEUX degrés. Avant d\'engager l\'eau, je veux votre avis de chef d\'engin. PARLEZ.']], []),
    ph('tension', 'Premiers jets', 'Quelques bouteilles volent.', TENS(0.5),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Je refuse l\'eau : verglas probable. Je demande un autre moyen. PARLEZ.']], ['Une personne âgée glisse']),
    ph('decision', 'Décision', 'Vous choisissez l\'eau ou le refus.', FOULE('dispersion'),
      [['MISTRAL', 'NEPTUNE UN ICI MISTRAL. Objection reçue : pas d\'eau sur des personnes par ce froid. Restez en réserve, prêt pour les feux. TERMINÉ.']], []),
    ph('fin', 'Dispersion', 'La foule se disperse.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Fin d\'emploi. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Ne causer aucune chute due au verglas', 'limiter_blesses', { max: 0 }),
    ob('o2', 'Justifier chaque usage de l\'eau au journal', 'personnalise', { target: 'journal_decisions', count: 2 }),
    os('o3', 'Refuser un jet d\'eau inadapté au froid', 'zero_bavure'),
    os('o4', 'Protéger les personnes âgées', 'proteger_site', { target: 'personne_agee' }),
  ],
  failures: [fail('bavure_grave', 'Un jet cause une chute grave sur le verglas.'), fail('trop_de_blesses', 'Trop de chutes.', 4)],
  randomEvents: ['Une personne âgée glisse', 'Le givre gagne le bord du jardin', 'Un malaise dû au froid', 'Pression d\'eau gelée'],
  unique: 'La météo décide : l\'opérateur apprend à dire non.',
  tags: ['froid', 'verglas'],
});

export const EAU_06 = mission({
  ...COND, type: 'manifestation_interdite', duration: 'longue', difficulty: 3, chapter: 10,
  id: 'canon-06-a-sec',
  title: 'À sec',
  pitch: 'Onze minutes de jet dans la cuve pour tout un après-midi : économiser, ravitailler une fois, sans découvrir la ligne.',
  briefing: [
    `Avenue des Champs-Élysées, un après-midi d'émeute. Votre engin est le seul disponible, avec une cuve de dix mille litres, soit onze minutes de jet à plein débit. Le ravitaillement se fait sur une bouche d'incendie, à six cents mètres. La ligne de CRS compte sur vous pour l'appui.`,
    `Vous êtes conducteur : votre mission est de faire durer la cuve tout l'après-midi, de ravitailler une fois sans découvrir la ligne et de ne jamais rester à sec pendant un feu. L'opérateur tire, vous gérez la logistique.`,
    `Surveillez le niveau. À moins de deux mille litres, annoncez et demandez le ravitaillement. Quittez la ligne par la rue latérale, branchez-vous sur la bouche d'incendie, faites le plein en quatre-vingt-dix secondes, revenez. Laissez l'opérateur gérer le débit. Évitez le jet droit.`,
    `Une cuve vide pendant un feu est une faute. Un ravitaillement qui découvre la ligne est une faute. Rendez compte à votre commandant avant chaque départ.`,
  ],
  place: 'Avenue des Champs-Élysées', timeOfDay: 14, weather: 'couvert', windFrom: 260, windSpeed: 4,
  crowd: crowd(800, 'libertes', 0.55, 0.7, 0.2, { gilets_jaunes: 0.35, black_bloc: 0.2, syndical: 0.15, curieux: 0.3 },
    ['Avenue des Champs-Élysées', 'Rond-Point des Champs-Élysées - Marcel Dassault', 'Avenue Montaigne'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents personnes, assauts répétés sur la ligne.',
    'Deux cents individus déterminés.', ['Avenue des Champs-Élysées', 'Avenue Montaigne'],
    ['Surveiller la cuve', 'Ravitailler avant deux mille litres', 'Prévenir la ligne']),
  phases: [
    ph('depart', 'Début de l\'appui', 'La cuve est pleine ; l\'appui commence.', T(180),
      [['NEPTUNE 1', 'MISTRAL ICI NEPTUNE UN. En place derrière la ligne, cuve pleine, DIX MILLE litres. PARLEZ.']], []),
    ph('consommation', 'Consommation', 'Les jets de la tourelle consomment vite.', T(420),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Reste QUATRE MILLE litres. PARLEZ.']], ['Un feu de poubelle contre une façade']),
    ph('ravitaillement', 'Ravitaillement', 'Vous quittez la ligne pour la borne.', TENS(0.65),
      [['MISTRAL', 'NEPTUNE UN ICI MISTRAL. Allez ravitailler à la bouche d\'incendie, la ligne tient sans vous. Rendez compte au retour. PARLEZ.']], []),
    ph('fin', 'Retour', 'Vous revenez en ligne.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. De retour, cuve pleine. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Rester en appui de la ligne pendant trente minutes, ravitaillement compris', 'tenir_position', { place: 'Avenue des Champs-Élysées', seconds: 1800 }),
    ob('o2', 'Ravitailler une seule fois sans découvrir la ligne', 'personnalise', { target: 'ravitaillement', count: 1 }),
    os('o3', 'Ne jamais rester à sec pendant un feu', 'personnalise', { target: 'cuve_vide_pendant_un_feu', max: 0 }),
    os('o4', 'Prévenir la salle à chaque mouvement', 'personnalise', { target: 'compte_rendu', count: 2 }),
  ],
  failures: [fail('personnalise', 'Cuve vide pendant un feu.'), fail('ligne_enfoncee', 'La ligne est découverte pendant le ravitaillement.')],
  randomEvents: ['Un feu de poubelle contre une façade', 'La borne est occupée', 'Fuite sur la cuve', 'Pression d\'eau en baisse'],
  unique: 'La logistique de l\'eau : on gagne en économisant.',
  tags: ['logistique', 'longue'],
});

export const EAU_07 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-07-brassards-blancs',
  title: 'Brassards blancs',
  pitch: 'Dans la foule, des brassards blancs : journalistes, observateurs, soignants. Les identifier avant d\'arroser.',
  briefing: [
    `Boulevard de Bonne Nouvelle, une manifestation interdite se disperse. Des groupes de brassards blancs sont mêlés à la foule : journalistes, observateurs d'une association, street medics. Ils ne sont pas des cibles. Un groupe violent est à leur contact.`,
    `Vous êtes opérateur : votre mission est d'arroser les violents sans toucher les brassards blancs. Vous devez identifier chaque brassard avant de tirer, à l'œil ou par la caméra de la tourelle.`,
    `Balayez la foule. Repérez les brassards à la jumelle. Tirez uniquement quand la zone est dégagée. Si un brassard apparaît dans le jet, coupez. Annoncez « Brassard ! » à voix haute pour prévenir votre binôme.`,
    `Le jet n'est pas sélectif : il faut attendre qu'un brassard sorte de la ligne de tir. Un journaliste touché, c'est une faute majeure. Les médecins ne doivent jamais être visés.`,
  ],
  place: 'Boulevard de Bonne Nouvelle', timeOfDay: 17.5, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.5, 0.6, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.15, curieux: 0.35 },
    ['Boulevard de Bonne Nouvelle', 'Boulevard Saint-Denis'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; vingt brassards blancs signalés.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard de Bonne Nouvelle', 'Boulevard Saint-Denis'],
    ['Identifier les brassards', 'Attendre une ligne de tir dégagée', 'Annoncer chaque brassard']),
  phases: [
    ph('identification', 'Identification', 'Vous repérez les brassards dans la foule.', T(180),
      [['ICARE', 'NEPTUNE UN ICI ICARE. Brassards blancs à l\'est du boulevard, DEUX groupes. PARLEZ.']], []),
    ph('tir', 'Tir', 'Vous arrosez les violents à l\'ouest.', T(360),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Jet diffus sur le groupe violent. Brassard à l\'est, jet coupé. PARLEZ.']], ['Un journaliste passe dans la ligne de tir']),
    ph('densite', 'Brassards au contact', 'Un brassard se retrouve au contact des violents.', TENS(0.55),
      [['ICARE', 'NEPTUNE UN ICI ICARE. Brassard au contact du groupe, tir impossible. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les violents se replient.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Aucun brassard touché. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Ne toucher aucun brassard blanc', 'zero_bavure'),
    ob('o2', 'Disperser le groupe violent avec l\'eau', 'disperser', { place: 'Boulevard de Bonne Nouvelle' }),
    os('o3', 'Annoncer chaque brassard repéré', 'reperer_signaux', { count: 5 }),
    os('o4', 'Consommer moins de quatre mille litres', 'personnalise', { target: 'litres_consommes', max: 4000 }),
  ],
  failures: [fail('bavure_grave', 'Un journaliste ou un soignant est touché par le jet.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Un journaliste passe dans la ligne de tir', 'Un brassard est arraché', 'Pression d\'eau en baisse', 'Un street medic se plaque contre un mur'],
  unique: 'L\'identification sous pression : la décision de ne pas tirer est la plus difficile.',
  tags: ['identification', 'tiers'],
});

export const EAU_08 = mission({
  ...OPE, type: 'protection_secours', difficulty: 3, chapter: 10,
  id: 'canon-08-pompier-malgre-lui',
  title: 'Pompier malgré lui',
  pitch: 'Cinq feux à éteindre avant qu\'ils ne gagnent les façades, sous jets de projectiles : le canon à eau devient lance.',
  briefing: [
    `Boulevard Haussmann, un après-midi d'émeute. Cinq feux sont allumés : deux poubelles, une barricade de palettes, un scooter, une trottinette électrique. Les pompiers sont retenus ailleurs. Le canon à eau est le seul moyen disponible.`,
    `Vous êtes opérateur : votre mission est d'éteindre les cinq feux avant qu'ils ne gagnent les façades. Les projectiles tombent sur l'engin. Le conducteur manœuvre : vous visez.`,
    `Hiérarchisez : scooter et trottinette d'abord (pneus qui éclatent, batterie qui s'embrase), puis barricade, puis poubelles. Jet diffus pour économiser. Reprenez sur chaque rallumage. Appelez les pompiers si un feu dépasse vos moyens.`,
    `Ne visez pas les façades. Le jet droit sur une trottinette peut projeter des éclats. Gardez la tourelle orientée vers la ligne en cas d'attaque.`,
  ],
  place: 'Boulevard Haussmann', timeOfDay: 16, weather: 'clair', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, '', 0.55, 0.65, 0.25, { black_bloc: 0.3, curieux: 0.4, gilets_jaunes: 0.3 },
    ['Boulevard Haussmann', 'Rue Tronchet', 'Rue de Caumartin'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, pompiers: 1, samu: 0 }),
  intel: intel(
    'Quatre cents personnes ; cinq foyers de feu.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard Haussmann', 'Rue Tronchet'],
    ['Hiérarchiser les feux', 'Jet diffus', 'Appeler les pompiers au besoin']),
  phases: [
    ph('feux', 'Premiers feux', 'Deux poubelles brûlent à l\'angle.', T(120),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. CINQ foyers. Je commence par le scooter. PARLEZ.']], []),
    ph('extinction', 'Extinction', 'Vous éteignez scooter et trottinette.', T(360),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Scooter éteint, reste TROIS foyers. PARLEZ.']], ['Pneu qui éclate']),
    ph('barricade', 'Barricade', 'Vous attaquez la barricade de palettes.', TENS(0.65),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Barricade en cours. Reste QUATRE MILLE litres. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les foyers sont éteints.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Tous les foyers éteints. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Éteindre cinq foyers avant qu\'ils gagnent une façade', 'eteindre', { count: 5 }),
    ob('o2', 'Traiter d\'abord les foyers à risque d\'explosion', 'traiter_incidents', { target: 'scooter', count: 2 }),
    os('o3', 'Garder plus de trois mille litres', 'personnalise', { target: 'reserve_eau', count: 3000 }),
    os('o4', 'Ne viser aucune façade', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Une façade prend feu.'), fail('joueur_hors_combat', 'Équipage hors de combat.')],
  randomEvents: ['Un pneu éclate', 'Une batterie se rallume', 'Un jet de pavé sur l\'engin', 'Pression d\'eau en baisse'],
  unique: 'Le canon à eau n\'est pas qu\'un instrument de dispersion : c\'est d\'abord le premier pompier.',
  tags: ['feu', 'extinction'],
});

export const EAU_09 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-09-tiers-proteges',
  title: 'Tiers protégés',
  pitch: 'Un groupe violent mêlé à des journalistes et à un poste de soins : n\'atteindre que les auteurs.',
  briefing: [
    `Place de la République, début de soirée. Un groupe de quarante individus violents occupe le pied de la statue. À dix mètres, une équipe de journalistes et un poste de soins improvisé d'une association de street medics. L'engin lanceur d'eau est à cinquante mètres.`,
    `Vous êtes opérateur : votre mission est de disperser le groupe violent sans toucher les journalistes ni les soignants. Un jet mal dirigé blesse un tiers et ruine l'image de la mission.`,
    `Repérez les tiers à la jumelle. Visez uniquement le groupe violent, jet bas. Utilisez la pluie d'abord. Au signal du chef, passez au diffus. Gardez l'œil sur le poste de soins : tout vent défavorable impose de couper.`,
    `Le vent d'ouest est faible mais peut porter le jet vers le poste de soins : attendez qu'il tombe. Un soignant gazé ou mouillé, c'est un reportage.`,
  ],
  place: 'Place de la République', timeOfDay: 18.5, weather: 'nuageux', windFrom: 270, windSpeed: 3,
  crowd: crowd(500, '', 0.55, 0.65, 0.2, { black_bloc: 0.2, gilets_jaunes: 0.25, syndical: 0.15, curieux: 0.4 },
    ['Place de la République', 'Boulevard du Temple'], 0.35),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un poste de soins et une équipe de presse à dix mètres des violents.',
    'Quarante individus déterminés.', ['Place de la République', 'Boulevard du Temple'],
    ['Repérer le poste de soins', 'Commencer par la pluie', 'Tenir compte du vent']),
  phases: [
    ph('observation', 'Observation', 'Vous repérez les tiers et le groupe violent.', T(180),
      [['ICARE', 'NEPTUNE UN ICI ICARE. Groupe violent au pied de la statue, tiers à l\'ouest. PARLEZ.']], []),
    ph('tir', 'Tir sélectif', 'Vous arrosez uniquement le groupe violent.', T(360),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Jet bas sur le groupe violent. Tiers protégés. PARLEZ.']], ['Le vent pousse le jet vers le poste de soins']),
    ph('vent', 'Vent défavorable', 'Le vent porte l\'eau vers les tiers ; il faut couper.', TENS(0.6),
      [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Vent défavorable, je coupe. PARLEZ.']], []),
    ph('fin', 'Fin', 'Le groupe violent se disperse.', FIN, [['NEPTUNE 1', 'CENTRAL ICI NEPTUNE UN. Aucun tiers touché. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Disperser le groupe violent sans toucher un tiers', 'disperser', { place: 'Place de la République' }),
    ob('o2', 'Couper le jet au premier vent défavorable', 'personnalise', { target: 'coupure_vent' }),
    os('o3', 'Épargner le poste de soins', 'proteger_site', { target: 'poste_soins' }),
    os('o4', 'Épargner l\'équipe de presse', 'proteger_site', { target: 'presse' }),
  ],
  failures: [fail('bavure_grave', 'Un journaliste ou un soignant est touché.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Le vent pousse le jet vers le poste de soins', 'Un journaliste s\'avance', 'Un soignant traverse la zone', 'Pression d\'eau en baisse'],
  unique: 'Un jet d\'eau est imprécis : le tir sélectif est une discipline.',
  tags: ['tiers', 'selectif'],
});

export const CANON_EAU: MissionDef[] = [
  EAU_01, EAU_02, EAU_03, EAU_04, EAU_05, EAU_06, EAU_07, EAU_08, EAU_09,
];
