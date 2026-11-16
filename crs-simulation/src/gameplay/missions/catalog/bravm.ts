/* =====================================================================================
 * Catalogue — BRAV-M : binôme à moto (pilote et passager), mobilité, flagrant délit.
 * Détachement facultatif de la carrière (chapitre 9) ; indicatifs « FAUCON ».
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';
import { CG_03 } from './chef-groupe';

const PILOTE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'bravm', rank: 'gardien', poste: 'pilote_moto' };
const PASSAGER: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'bravm', rank: 'gardien', poste: 'passager_moto' };

export const BRAVM_01 = mission({
  ...PILOTE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 9,
  id: 'bravm-01-en-selle',
  title: 'En selle',
  pitch: 'Premier jour sur la moto de service : démarrer, rouler en colonne de binômes, s\'arrêter et mettre pied à terre ensemble.',
  briefing: [
    `Esplanade des Invalides, un matin d'automne. La BRAV-M, brigade de répression de l'action violente motorisée, forme ses nouveaux pilotes. Une colonne de six motos s'aligne devant vous. Un moniteur vous attend avec un parcours de cônes. Il n'y a pas de foule.`,
    `Votre mission est d'apprendre à conduire la moto de service : démarrage, colonne par deux à trente kilomètres-heure, arrêt à quarante mètres de l'objectif et pied à terre ensemble. Vous êtes pilote : le passager compte sur vous pour la stabilité.`,
    `Mettez le casque, démarrez, placez-vous en colonne de binômes. Suivez le moniteur à distance de deux motos. Au signal, arrêtez-vous en ligne, coupez le moteur, mettez pied à terre en cinq secondes. Un pilote sur trois garde les motos.`,
    `Une moto sans pilote est une moto perdue : ne laissez jamais votre moto sans surveillance pendant l'intervention. La vitesse n'est pas le but : l'ordre de la colonne l'est.`,
  ],
  place: 'Esplanade des Invalides', timeOfDay: 9, weather: 'clair', windFrom: 270, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ bravm: 3 }),
  intel: intel('Parcours de cônes, aucune foule.', 'Aucun signalement.', ['Esplanade des Invalides'],
    ['Garder deux motos de distance', 'S\'arrêter en ligne', 'Mettre pied à terre ensemble']),
  phases: [
    ph('depart', 'Départ en colonne', 'Les motos s\'alignent et démarrent en binôme.', T(60),
      [['FAUCON 1', 'FAUCON DEUX ICI FAUCON UN. Colonne par deux, départ. PARLEZ.']], []),
    ph('parcours', 'Parcours de cônes', 'Slalom entre les cônes à trente kilomètres-heure.', T(120),
      [['FAUCON 1', 'FAUCON DEUX ICI FAUCON UN. Gardez deux motos de distance. PARLEZ.']], ['Un cône est renversé']),
    ph('arret', 'Arrêt et pied à terre', 'Arrêt en ligne, pied à terre en cinq secondes.', FIN,
      [['FAUCON 1', 'FAUCON DEUX ICI FAUCON UN. Pied à terre. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Rouler en colonne de binômes sans renverser un seul cône', 'personnalise', { target: 'parcours_cones', count: 12 }),
    ob('o2', 'Mettre pied à terre ensemble en moins de cinq secondes', 'duree', { seconds: 5 }),
    os('o3', 'Garder la distance de deux motos', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Chute de la moto : atelier à refaire.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Un cône est renversé', 'Le moniteur change le parcours'],
  unique: 'Le B-A-BA de la moto de service : la colonne est plus importante que la vitesse.',
  tags: ['formation', 'moto'],
});

export const BRAVM_02 = mission({
  ...PILOTE, type: 'patrouille', difficulty: 3, chapter: 9,
  id: 'bravm-02-cortege-sauvage',
  title: 'Cortège sauvage',
  pitch: 'Suivre un groupe mobile de quatre-vingts personnes sur les Grands Boulevards, de nuit, sans jamais rouler dans la foule.',
  briefing: [
    `Boulevard Montmartre, une nuit de semaine. Un cortège sauvage d'environ quatre-vingts personnes remonte les Grands Boulevards vers la rue de la Paix, en brisant des vitrines. Le drone suit à distance. Votre binôme est à moto en colonne de six.`,
    `Votre mission est de suivre le groupe pendant huit minutes, de l'empêcher d'atteindre trois cibles identifiées (deux banques, une bijouterie) et de n'interpeller que sur faits constatés. Vous ne devez jamais rouler dans la foule.`,
    `En colonne de binômes, vous restez à cinquante mètres. Le drone désigne les groupes. À l'ordre, vous barrez une rue, mettez pied à terre et interpellez. Un pilote sur trois reste aux motos. Remontez ensuite sur la moto pour reprendre la filature.`,
    `Un piéton heurté est une faute lourde. Ne roulez jamais à plus de trente kilomètres-heure en présence de foule. Les motos sont une cible : ne les laissez pas sans garde.`,
  ],
  place: 'Boulevard Montmartre', timeOfDay: 23, weather: 'couvert', windFrom: 240, windSpeed: 3,
  crowd: crowd(80, '', 0.55, 0.7, 0.4, { black_bloc: 0.5, curieux: 0.2, fetards: 0.3 },
    ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'], 0.1),
  forces: forces({ bravm: 6, drone: true, pompiers: 1, samu: 0 }),
  intel: intel(
    'Quatre-vingts personnes en groupe mobile ; trois cibles identifiées.',
    'Une soixantaine d\'individus encagoulés, marteaux et fumigènes.', ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'],
    ['Rester à cinquante mètres', 'Ne jamais rouler dans la foule', 'Garder un pilote sur trois aux motos']),
  phases: [
    ph('suivi', 'Filature', 'Le groupe remonte les boulevards ; vous le suivez.', T(180),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Groupe de QUATRE-VINGTS, tenue noire, remonte les boulevards. PARLEZ.']], []),
    ph('cible', 'Première cible', 'Le groupe brise la vitrine d\'une banque ; vous barrez la rue.', TENS(0.55),
      [['CENTRAL', 'FAUCON DEUX ICI CENTRAL. Groupe de UN-CINQ individus, vitrines brisées, boulevard des Italiens. Objectif désigné par ICARE. Interpellez sur fait constaté. PARLEZ.']],
      ['Un piéton traverse devant la colonne']),
    ph('intervention', 'Intervention', 'Pied à terre, interpellation de trois auteurs.', FOULE('dispersion'),
      [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. UN interpellé pour dégradation, fait filmé. PARLEZ.']], []),
    ph('fin', 'Fin de filature', 'Le groupe se disperse.', FIN, [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Groupe dispersé, DEUX interpellés. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Suivre le groupe pendant huit minutes sans rouler dans la foule', 'guider_unite', { seconds: 480 }),
    ob('o2', 'Empêcher l\'atteinte d\'au moins deux des trois cibles', 'proteger_site', { count: 2 }),
    os('o3', 'Interpeller deux auteurs sur faits', 'interpeller', { count: 2 }),
    os('o4', 'Ne laisser aucune moto sans garde', 'proteger_site', { target: 'motos' }),
  ],
  failures: [fail('bavure_grave', 'Un piéton est heurté par une moto.'), fail('personnalise', 'Deux cibles sont atteintes.')],
  randomEvents: ['Un piéton traverse devant la colonne', 'Un feu de poubelle bloque la rue', 'Une moto cale', 'Un jet de bouteille sur les motos'],
  unique: 'La mobilité est l\'arme : prévoir où le groupe ira avant qu\'il n\'y soit.',
  altRoles: ['manifestant', 'telepilote'], tags: ['filature', 'nuit', 'miroir'],
});

export const BRAVM_03 = mission({
  ...PASSAGER, type: 'interpellation_ciblee', difficulty: 3, chapter: 9,
  id: 'bravm-03-flagrant-delit',
  title: 'Flagrant délit',
  pitch: 'Un casseur désigné à la jumelle, trente secondes pour le rejoindre à pied entre les terrasses de la place de la Bourse.',
  briefing: [
    `Place de la Bourse, en fin d'après-midi. Un cortège dégénère : un individu a jeté un pavé sur un fourgon. Le drone le suit : veste verte, sac noir. Il entre dans la foule. Votre binôme est le plus proche.`,
    `Votre mission est de descendre de la moto, de rejoindre la cible en moins de trente secondes, de l'interpeller sur flagrant délit et de remettre son dossier à l'officier. Vous êtes passager : vous tenez la caméra-piéton.`,
    `À l'arrêt, sautez à pied. Le pilote garde la moto. Avancez par les trottoirs, jamais dans la foule dense. Identifiez-vous à voix haute. Plaquez, menottez. Remontez sur la moto avec l'interpellé au fourgon.`,
    `Ne confondez pas la cible avec un passant en veste verte. Le flagrant délit doit être constaté : si vous perdez de vue la cible plus de dix secondes, renoncez.`,
  ],
  place: 'Place de la Bourse', timeOfDay: 17, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'pouvoir_achat', 0.5, 0.6, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.1, curieux: 0.4 },
    ['Place de la Bourse', 'Rue du Quatre Septembre', 'Rue de Richelieu'], 0.3),
  forces: forces({ bravm: 3, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes, ambiance crispée.',
    'Une soixantaine d\'individus déterminés.', ['Place de la Bourse', 'Rue du Quatre Septembre'],
    ['Suivre la cible à la jumelle', 'Arriver en moins de trente secondes', 'Remplir la fiche immédiatement']),
  phases: [
    ph('designation', 'Désignation', 'Le drone désigne la cible.', T(60),
      [['ICARE', 'FAUCON DEUX ICI ICARE. Cible désignée, veste verte, sac noir, à CENT mètres. PARLEZ.']], []),
    ph('approche', 'Approche à pied', 'Vous descendez de la moto ; le pilote la garde.', T(180),
      [['FAUCON 2', 'ICARE ICI FAUCON DEUX. Pied à terre, j\'avance. PARLEZ.']], ['La cible se mêle à un groupe de passants']),
    ph('interpellation', 'Interpellation', 'Vous plaquez et menottez.', TENS(0.5),
      [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. UN interpellé pour jet de projectile sur agents, heure UNE-SEPT heures UN-DEUX, fait filmé. PARLEZ.']], []),
    ph('fin', 'Repli', 'Vous remettez l\'interpellé au fourgon.', FIN, [['CENTRAL', 'FAUCON DEUX ICI CENTRAL. Fiche reçue. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Atteindre la cible en moins de trente secondes', 'interpeller', { target: 'cible_drone', count: 1, seconds: 30 }),
    ob('o2', 'Remettre une fiche complète avec heure et fait', 'personnalise', { target: 'fiche_interpellation', count: 1 }),
    os('o3', 'Ne confondre personne', 'zero_bavure'),
    os('o4', 'Garder la moto sous surveillance', 'proteger_site', { target: 'moto' }),
  ],
  failures: [fail('interpelle', 'Mauvaise personne interpellée.'), fail('bavure_grave', 'Interpellation sans fait constaté.')],
  randomEvents: ['La cible change de veste', 'Un passant fait obstacle', 'Un journaliste filme de près', 'La moto est entourée par des curieux'],
  unique: 'Le flagrant délit n\'attend pas : trente secondes décident si l\'on interpelle.',
  tags: ['flagrant-delit'],
});

export const BRAVM_04 = mission({
  ...PILOTE, ...scene(CG_03), difficulty: 3, chapter: 9, mirrorOf: CG_03.id, altRoles: ['chef_groupe'],
  id: 'bravm-04-quatre-vingt-dix-secondes',
  title: 'Quatre-vingt-dix secondes',
  pitch: 'Rue de la Paix, un pillage en cours : la moto arrive avant le groupe de CRS et dispose de quatre-vingt-dix secondes pour tenir.',
  briefing: [
    `Rue de la Paix, début de soirée. Un groupe d'une quinzaine d'individus encagoulés brise la vitrine d'une bijouterie et commence à piller. Le drone désigne le groupe. Votre binôme est à moto, à cent mètres : les CRS sont à trois cents mètres.`,
    `Votre mission est d'arriver avant eux, de tenir le magasin pendant quatre-vingt-dix secondes sans engager le contact avec un groupe plus nombreux, puis d'appuyer l'interpellation par le groupe de CRS. Vous êtes pilote : la moto doit rester gardée.`,
    `Roulez à trente kilomètres-heure maximum. Arrêtez-vous à cinquante mètres. Le passager descend et surveille. Le pilote garde la moto, rend compte. À l'arrivée du groupe, restez en couverture.`,
    `Ne cherchez pas l'interpellation seul face à quinze : l'objectif est de les fixer. Ne laissez pas la moto à portée des casseurs.`,
  ],
  intel: intel(
    'Cent vingt personnes, une quinzaine de pilleurs organisés.',
    'Un groupe de quinze individus encagoulés, marteaux et sacs.', ['Rue de la Paix', 'Place Vendôme'],
    ['Arriver avant le groupe de CRS', 'Ne pas engager seul', 'Garder la moto']),
  phases: [
    ph('alerte', 'Alerte pillage', 'Vous êtes les premiers à portée.', T(60),
      [['CENTRAL', 'FAUCON DEUX ICI CENTRAL. Groupe de UN-CINQ individus, vitrines brisées, rue de la Paix. Objectif désigné par ICARE. PARLEZ.']], []),
    ph('approche', 'Approche en moto', 'Vous roulez à trente kilomètres-heure vers le magasin.', T(150),
      [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. En route, QUATRE-VINGT-DIX secondes. PARLEZ.']], ['Un passant traverse devant la moto']),
    ph('tenue', 'Tenue du magasin', 'Vous fixez le groupe en attendant les CRS.', TENS(0.55),
      [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. Sur place, je fixe le groupe. Attends les CRS. PARLEZ.']], []),
    ph('fin', 'Relais', 'Le groupe de CRS prend la suite.', FIN,
      [['MISTRAL 2 ALFA', 'FAUCON DEUX ICI MISTRAL DEUX ALFA. Nous prenons le relais. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Arriver sur place en moins de quatre-vingt-dix secondes', 'guider_unite', { place: 'Rue de la Paix', seconds: 90 }),
    ob('o2', 'Tenir le magasin sans engager seul', 'proteger_site', { target: 'bijouterie' }),
    os('o3', 'Garder la moto intacte', 'proteger_site', { target: 'moto' }),
    os('o4', 'Rendre compte à chaque phase', 'personnalise', { target: 'compte_rendu', count: 3 }),
  ],
  failures: [fail('bavure_grave', 'Un piéton est heurté.'), fail('personnalise', 'La moto est volée ou incendiée.')],
  randomEvents: ['Un passant traverse devant la moto', 'Le groupe se divise', 'Une moto est entourée', 'Une alarme se déclenche'],
  unique: 'La BRAV-M est l\'avant-garde : arriver la première, tenir sans s\'exposer.',
  tags: ['pillage', 'miroir'],
});

export const BRAVM_05 = mission({
  ...PILOTE, type: 'protection_secours', difficulty: 3, chapter: 9,
  id: 'bravm-05-escorte-incendie',
  title: 'Escorte incendie',
  pitch: 'Un fourgon de pompiers bloqué par une barricade : ouvrir la route en moto et le conduire jusqu\'au feu.',
  briefing: [
    `Boulevard Henri IV, une barricade de poubelles et de trottinettes enflammées bloque la route d'un fourgon de pompiers. Un immeuble brûle plus loin, des riverains sont aux fenêtres. Votre binôme est le seul disponible.`,
    `Votre mission est de guider le fourgon de pompiers par un itinéraire libre jusqu'à l'immeuble en feu, de protéger son approche contre les jets de projectiles et de tenir un couloir de trois mètres.`,
    `Prenez la tête du fourgon à vingt mètres. Choisissez l'itinéraire par les rues latérales. Au contact, mettez pied à terre, sécurisez le périmètre. Le fourgon s'arrête à cinquante mètres de la barricade si la zone est hostile.`,
    `Ne faites jamais passer un fourgon sous des jets : demandez un renfort. Les trottinettes électriques brûlent mal : n'y touchez pas. La priorité est la vie des habitants.`,
  ],
  place: 'Boulevard Henri IV', timeOfDay: 22, weather: 'clair', windFrom: 250, windSpeed: 2,
  crowd: crowd(150, '', 0.5, 0.6, 0.25, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Boulevard Henri IV', 'Rue Saint-Antoine'], 0.15),
  forces: forces({ bravm: 3, pompiers: 3, samu: 1 }),
  intel: intel(
    'Cent cinquante personnes, une barricade enflammée.',
    'Une cinquantaine d\'individus déterminés autour de la barricade.', ['Boulevard Henri IV', 'Rue Saint-Antoine'],
    ['Guider par les rues latérales', 'Ne pas faire passer sous les jets', 'Tenir un couloir de trois mètres']),
  phases: [
    ph('blocage', 'Barricade', 'Le fourgon est bloqué ; vous le rejoignez.', T(90),
      [['SANTÉ 1', 'FAUCON DEUX ICI SANTÉ UN. Barricade en feu devant nous, nous attendons votre guidage. PARLEZ.']], []),
    ph('guidage', 'Guidage', 'Vous le conduisez par les rues latérales.', T(240),
      [['FAUCON 2', 'SANTÉ UN ICI FAUCON DEUX. Suivez-moi, rue latérale à gauche. PARLEZ.']], ['Jets de bouteilles sur le fourgon']),
    ph('couloir', 'Tenue du couloir', 'Vous protégez l\'approche du fourgon.', TENS(0.5),
      [['FAUCON 2', 'SANTÉ UN ICI FAUCON DEUX. Couloir tenu, vous pouvez avancer. PARLEZ.']], []),
    ph('fin', 'Extinction', 'Le fourgon éteint l\'incendie ; les riverains sont évacués.', FIN,
      [['SANTÉ 1', 'FAUCON DEUX ICI SANTÉ UN. Feu maîtrisé. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Guider le fourgon jusqu\'à l\'immeuble en feu', 'escorter', { place: 'Boulevard Henri IV', target: 'pompiers' }),
    ob('o2', 'Tenir un couloir de trois mètres jusqu\'à la fin de l\'extinction', 'proteger_site', { target: 'couloir_secours', seconds: 600 }),
    os('o3', 'Aucun jet de projectile sur le fourgon', 'zero_bavure'),
    os('o4', 'Évacuer deux riverains par l\'escalier', 'evacuer', { target: 'riverain', count: 2 }),
  ],
  failures: [fail('personnalise', 'Le fourgon est visé par des projectiles.'), fail('victime_non_secourue', 'Un riverain n\'est pas évacué à temps.')],
  randomEvents: ['Une batterie de trottinette s\'embrase', 'Un curieux bloque le fourgon', 'Panne de la moto', 'Un riverain saute d\'un balcon'],
  unique: 'Un binôme à moto devient l\'escorte d\'un camion de pompiers.',
  tags: ['secours', 'escorte'],
});

export const BRAVM_06 = mission({
  ...PASSAGER, type: 'emeute_nocturne', difficulty: 4, chapter: 9,
  id: 'bravm-06-nuit-d-ete',
  title: 'Nuit d\'été',
  pitch: 'Une nuit chaude, cinq foyers de désordre en même temps et une colonne de motos à répartir entre eux.',
  briefing: [
    `Boulevard de Magenta, une soirée d'été étouffante. Des groupes se forment à plusieurs endroits : un pillage, un feu de poubelle, deux bagarres et un regroupement de casseurs. La salle dispose de six motos pour cinq foyers.`,
    `Votre mission est de répondre à trois appels successifs, de choisir quand et où engager, de ne pas vous exposer seul et de revenir à la colonne entre deux interventions. Vous êtes passager : vous tenez la radio et la caméra.`,
    `Priorisez : pillage d'abord, bagarre ensuite, feu en dernier. Chaque intervention dure trois minutes au plus. Vous revenez à la colonne avant d'en commencer une autre. Rendez compte à chaque fois.`,
    `Un binôme isolé est un binôme perdu. N'engagez pas un groupe de plus de dix personnes sans renfort. Hydratez-vous : la chaleur tue la lucidité.`,
  ],
  place: 'Boulevard de Magenta', timeOfDay: 23.5, weather: 'clair', windFrom: 200, windSpeed: 1,
  crowd: crowd(500, '', 0.5, 0.7, 0.2, { fetards: 0.35, black_bloc: 0.2, curieux: 0.3, supporters: 0.15 },
    ['Boulevard de Magenta', 'Boulevard de Strasbourg', 'Gare de l\'Est'], 0.25),
  forces: forces({ bravm: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes éparpillées ; cinq foyers de désordre.',
    'Une soixantaine d\'individus déterminés dans trois groupes.', ['Boulevard de Magenta', 'Boulevard de Strasbourg'],
    ['Prioriser le pillage', 'Rentrer entre deux interventions', 'Boire régulièrement']),
  phases: [
    ph('appels', 'Premiers appels', 'Trois appels arrivent en même temps.', T(120),
      [['CENTRAL', 'FAUCON DEUX ICI CENTRAL. TROIS foyers actifs. Priorité au pillage, boulevard de Magenta. PARLEZ.']], []),
    ph('pillage', 'Pillage', 'Vous interpellez deux pilleurs en flagrant délit.', T(360),
      [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. DEUX interpellés, pillage terminé. PARLEZ.']], ['Un feu de scooter s\'allume']),
    ph('bagarre', 'Bagarre', 'Deux groupes de fêtards s\'affrontent.', TENS(0.6),
      [['CENTRAL', 'FAUCON DEUX ICI CENTRAL. Bagarre de TRENTE personnes, boulevard de Strasbourg. PARLEZ.']], []),
    ph('fin', 'Retour au calme', 'La nuit s\'apaise.', FIN, [['FAUCON 2', 'CENTRAL ICI FAUCON DEUX. RAS, retour à la colonne. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Répondre à trois appels successifs', 'traiter_incidents', { count: 3 }),
    ob('o2', 'Interpeller au moins trois auteurs sur faits', 'interpeller', { count: 3 }),
    os('o3', 'Revenir à la colonne entre deux interventions', 'personnalise', { target: 'retour_colonne', count: 2 }),
    os('o4', 'Ne jamais se retrouver seul face à plus de dix personnes', 'zero_bavure'),
  ],
  failures: [fail('joueur_hors_combat', 'Binôme isolé et pris à partie.'), fail('trop_de_blesses', 'Trop de blessés parmi les agents.', 4)],
  randomEvents: ['Un feu de scooter', 'Deux appels simultanés', 'Un passant blessé', 'Chaleur et malaise d\'un agent'],
  unique: 'Plusieurs foyers, trop peu de motos : la priorité fait la mission.',
  tags: ['nuit', 'multipoints'],
});

export const BRAVM_07 = mission({
  ...PILOTE, type: 'manifestation_declaree', difficulty: 4, chapter: 9,
  id: 'bravm-07-sous-l-objectif',
  title: 'Sous l\'objectif',
  pitch: 'Cinq téléphones, une équipe d\'observateurs et une interpellation : aucune faute n\'est permise, aucun mot de trop.',
  briefing: [
    `Boulevard du Temple, fin de manifestation. Un cortège déclaré de huit cents personnes se disperse. Un individu a lancé une bouteille sur un agent. Cinq téléphones et une équipe d'observateurs filment la scène. Votre binôme est désigné pour l'interpellation.`,
    `Votre mission est d'interpeller l'auteur sans aucune faute filmée : pas de coup, pas de mot insultant, pas de geste brusque. La mission est évaluée sur l'image publique de la séquence autant que sur le résultat.`,
    `Approche calme, identification à voix haute, menottage sans violence, explications au prévenu. Le passager filme à son tour. Le pilote garde la moto. Parlez aux observateurs : ils ont le droit de regarder.`,
    `Chaque geste est filmé : un geste de trop devient un reportage. Ne vous énervez jamais. Vous pouvez expliquer votre intervention aux observateurs, sans vous justifier à l'excès.`,
  ],
  place: 'Boulevard du Temple', timeOfDay: 18, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(800, 'pouvoir_achat', 0.35, 0.45, 0.05, { syndical: 0.4, familles: 0.2, gilets_jaunes: 0.2, curieux: 0.2 },
    ['Place de la République', 'Boulevard du Temple'], 0.45),
  forces: forces({ bravm: 3, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents personnes ; ambiance calme, nombreux téléphones.',
    'Un individu isolé a lancé une bouteille.', ['Boulevard du Temple', 'Place de la République'],
    ['Rester calme', 'Annoncer chaque geste', 'Laisser filmer les observateurs']),
  phases: [
    ph('designation', 'Désignation', 'Le drone désigne l\'auteur de la bouteille.', T(90),
      [['ICARE', 'FAUCON UN ICI ICARE. Individu désigné, casquette bleue, à QUATRE-VINGTS mètres. PARLEZ.']], []),
    ph('approche', 'Approche sous les caméras', 'Cinq téléphones filment votre approche.', T(240),
      [['FAUCON 1', 'ICARE ICI FAUCON UN. Je m\'identifie à voix haute. PARLEZ.']], ['Un observateur demande à voir la caméra-piéton']),
    ph('interpellation', 'Interpellation', 'Vous menottez sans violence.', TENS(0.4),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. UN interpellé, état de santé vérifié. PARLEZ.']], ['Un manifestant crie « honte ! »']),
    ph('fin', 'Remise', 'Vous remettez l\'interpellé à l\'officier.', FIN, [['CENTRAL', 'FAUCON UN ICI CENTRAL. Séquence reçue. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Interpeller l\'auteur sans aucune faute filmée', 'zero_bavure'),
    ob('o2', 'Rester calme sous les insultes', 'personnalise', { target: 'sang_froid' }),
    os('o3', 'Expliquer l\'intervention aux observateurs', 'prevention', { target: 'observateurs', count: 1 }),
    os('o4', 'Garder l\'image publique supérieure à soixante', 'personnalise', { target: 'image_publique', count: 60 }),
  ],
  failures: [fail('bavure_grave', 'Un geste de trop, filmé : faute d\'image.'), fail('revocation', 'Violence caractérisée.')],
  randomEvents: ['Un observateur demande à voir la caméra-piéton', 'Un manifestant crie des insultes', 'Un journaliste insiste', 'La caméra-piéton s\'éteint'],
  unique: 'La mission se joue sur l\'image : on est jugé avant d\'être compris.',
  tags: ['image', 'observateurs'],
});

export const BRAVM_08 = mission({
  ...PILOTE, type: 'patrouille', difficulty: 4, chapter: 9,
  id: 'bravm-08-isoles',
  title: 'Isolés',
  pitch: 'À quatre cents mètres de tout renfort, un groupe pris à partie : rompre le contact, récupérer un agent tombé, rejoindre la ligne.',
  briefing: [
    `Rue de Bretagne, en pleine nuit. Votre groupe de six motos patrouille quand un attroupement hostile se forme. Des projectiles tombent. Un agent est renversé de sa moto. Vous êtes à quatre cents mètres de la ligne de CRS la plus proche.`,
    `Votre mission est de rompre le contact, de récupérer l'agent tombé, de ramener les motos et de rejoindre la ligne de CRS. Aucun agent ne doit être abandonné : un collègue à terre est la priorité absolue.`,
    `Formez un carré avec les motos. Deux agents protègent l'agent à terre. Un autre l'extrait sur sa moto. La colonne se replie par la rue de Bretagne vers la ligne de CRS. Demandez le renfort par radio dès le premier jet.`,
    `N'engagez pas la foule : vous êtes en nombre insuffisant. Abandonner une moto est possible, abandonner un agent est impossible.`,
  ],
  place: 'Rue de Bretagne', timeOfDay: 1, weather: 'couvert', windFrom: 230, windSpeed: 2,
  crowd: crowd(200, '', 0.65, 0.8, 0.4, { black_bloc: 0.4, curieux: 0.3, fetards: 0.3 },
    ['Rue de Bretagne', 'Rue du Temple', 'Place de la République'], 0.05),
  forces: forces({ bravm: 6, drone: true, pompiers: 0, samu: 0 }),
  intel: intel(
    'Deux cents personnes dans les rues voisines, la nuit.',
    'Une soixantaine d\'individus déterminés.', ['Rue de Bretagne', 'Rue du Temple'],
    ['Rester groupés', 'Demander le renfort', 'Ne pas abandonner d\'agent']),
  phases: [
    ph('patrouille', 'Patrouille', 'La colonne roule dans les rues désertes.', T(120),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Patrouille rue de Bretagne, RAS. PARLEZ.']], []),
    ph('contact', 'Prise à partie', 'Un attroupement hostile apparaît ; un agent est renversé.', TENS(0.6),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. URGENT. Pris à partie, UN agent à terre, QUATRE cents mètres de la ligne. PARLEZ.']], ['Un agent tombe de sa moto']),
    ph('extraction', 'Extraction', 'Vous récupérez l\'agent et repliez la colonne.', FOULE('dispersion'),
      [['CENTRAL', 'FAUCON UN ICI CENTRAL. Renfort en route, TROIS minutes. PARLEZ.']], []),
    ph('fin', 'Retour à la ligne', 'Vous rejoignez les CRS.', FIN, [['MISTRAL 1', 'FAUCON UN ICI MISTRAL UN. Passez la ligne. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Récupérer l\'agent tombé', 'secourir', { target: 'agent_a_terre', count: 1 }),
    ob('o2', 'Rejoindre la ligne de CRS sans autre perte', 'guider_unite', { place: 'Place de la République' }),
    os('o3', 'Ramener au moins quatre motos sur six', 'proteger_site', { target: 'motos', count: 4 }),
    os('o4', 'Demander le renfort dès le premier jet', 'personnalise', { target: 'renfort' }),
  ],
  failures: [fail('personnalise', 'Un agent est abandonné.'), fail('joueur_hors_combat', 'Hors de combat.')],
  randomEvents: ['Un agent tombe de sa moto', 'Une moto est incendiée', 'Panne radio de soixante secondes', 'Un jet de pavé depuis un toit'],
  unique: 'Isolé, pas désarmé : l\'ordre passe par la discipline du repli.',
  tags: ['nuit', 'repli'],
});

export const BRAVM_09 = mission({
  ...PILOTE, type: 'escorte', difficulty: 3, chapter: 9,
  id: 'bravm-09-le-pilote',
  title: 'Le pilote',
  pitch: 'Mener la colonne de motos du pont Notre-Dame à l\'Hôtel de Ville par un itinéraire libre, et garder les machines pendant l\'intervention.',
  briefing: [
    `Quai de l'Hôtel de Ville, en fin d'après-midi. Une colonne de six binômes doit rejoindre le parvis de l'Hôtel de Ville où un rassemblement tourne mal. Vous êtes pilote de tête : vous choisissez l'itinéraire.`,
    `Votre mission est de mener la colonne par un itinéraire libre jusqu'au parvis, de garder les motos pendant l'intervention des passagers et de repousser sans coup deux tentatives de vol de motos.`,
    `Évitez les quais saturés. Passez par le pont Notre-Dame et la rue de Lobau. Arrêtez-vous à cinquante mètres. Mettez pied à terre. Restez à la garde des motos avec un pilote sur trois. Au retour des passagers, repartez ensemble.`,
    `Une moto volée est une honte. Repoussez les curieux à la voix. Ne roulez jamais sur le parvis.`,
  ],
  place: 'Quai de l\'Hôtel de Ville', timeOfDay: 17.5, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, 'hopital', 0.4, 0.5, 0.08, { soignants: 0.4, syndical: 0.2, black_bloc: 0.08, curieux: 0.32 },
    ['Quai de l\'Hôtel de Ville', 'Pont Notre-Dame', 'Place de l\'Hôtel de Ville'], 0.4),
  forces: forces({ bravm: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes sur le parvis ; tension montante.',
    'Une trentaine d\'individus déterminés.', ['Place de l\'Hôtel de Ville', 'Pont Notre-Dame', 'Quai de Gesvres'],
    ['Choisir un itinéraire libre', 'Garder les motos', 'Repousser les curieux à la voix']),
  phases: [
    ph('depart', 'Départ de la colonne', 'Vous prenez la tête de la colonne.', T(120),
      [['FAUCON 1', 'FAUCON DEUX À SIX ICI FAUCON UN. Colonne par deux, départ. PARLEZ.']], []),
    ph('itineraire', 'Itinéraire', 'Vous évitez les quais saturés.', T(240),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Itinéraire par le pont Notre-Dame. PARLEZ.']], ['Un camion bloque le pont']),
    ph('garde', 'Garde des motos', 'Les passagers interviennent ; vous gardez les motos.', TENS(0.45),
      [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Motos gardées, passagers en intervention. PARLEZ.']], ['Deux curieux tentent de prendre une moto']),
    ph('fin', 'Retour', 'La colonne repart ensemble.', FIN, [['FAUCON 1', 'CENTRAL ICI FAUCON UN. Colonne reformée. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Conduire la colonne par un itinéraire libre jusqu\'au parvis', 'guider_unite', { place: 'Place de l\'Hôtel de Ville' }),
    ob('o2', 'Repousser deux tentatives de vol de moto sans coup', 'proteger_site', { target: 'motos', count: 2 }),
    os('o3', 'Ne perdre aucune moto', 'zero_bavure'),
    os('o4', 'Arriver en moins de cinq minutes', 'duree', { seconds: 300 }),
  ],
  failures: [fail('personnalise', 'Une moto est perdue.'), fail('bavure_grave', 'Un curieux est heurté.')],
  randomEvents: ['Un camion bloque le pont', 'Un curieux touche une moto', 'Un fêtard prend la colonne en photo', 'Une panne de moto'],
  unique: 'Le pilote est un chef d\'itinéraire : un bon trajet vaut dix interpellations.',
  tags: ['colonne', 'pilote'],
});

export const BRAVM: MissionDef[] = [
  BRAVM_01, BRAVM_02, BRAVM_03, BRAVM_04, BRAVM_05, BRAVM_06, BRAVM_07, BRAVM_08, BRAVM_09,
];
