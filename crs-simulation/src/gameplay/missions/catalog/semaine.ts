/* =====================================================================================
 * Catalogue — campagne « semaine de mobilisation » (six actes du commandant).
 * La fatigue des unités, les blessés, l'image publique et la colère de la rue se reportent
 * d'un acte au suivant : la tension de départ monte à chaque jour.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, T, TENS } from './dsl';
import type { MissionSpec } from './dsl';

const CDT: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'commandant', poste: 'commandant_unite' };

/** Acte 1 — mardi : la première journée, encore calme. */
export const SEMAINE_1 = mission({
  ...CDT,
  id: 'semaine-01-premier-appel',
  title: 'Semaine de mobilisation — Acte 1 : le premier appel',
  pitch: 'Mardi, place de la République : mille personnes répondent à l\'appel contre la taxe fictive « Sillon » sur les carburants. Tout semble calme. Rien ne le restera.',
  briefing: [
    `Une coalition d'automobilistes et d'artisans fictive, les « Routiers de Lutèce », appelle à une semaine de mobilisation contre une taxe sur les carburants. Le premier rassemblement est déclaré place de la République, mardi à 18 h. Mille personnes sont attendues, en gilet jaune pour beaucoup, dans une ambiance de reprise de contact.`,
    `Vous commandez la compagnie pour toute la semaine : fatigue des agents, blessés, image publique et colère de la rue se reportent d'un jour à l'autre. Votre mission du jour est de tenir un rassemblement calme sans le crisper, et de poser dès maintenant les bases : liaison avec les organisateurs, réserves hors de vue, relève prévue pour les jours suivants.`,
    `Deux sections visibles sur la place, deux en réserve rue du Faubourg-du-Temple. Ouvrez la liaison avec les organisateurs et obtenez leur engagement sur le parcours des jours suivants. Rendez compte à la salle toutes les dix minutes. Relevez les sections qui ont tenu vingt minutes de ligne.`,
    `Ne cherchez pas l'affrontement : chaque geste de trop se paiera toute la semaine, en tension de départ pour les actes suivants. L'objectif du mardi est d'arriver mercredi avec une image publique intacte et des agents reposés.`,
  ],
  type: 'manifestation_declaree', place: 'Place de la République', timeOfDay: 18, weather: 'clair', windFrom: 260, windSpeed: 3,
  crowd: crowd(1000, 'carburants', 0.1, 0.25, 0.02, { gilets_jaunes: 0.55, syndical: 0.1, familles: 0.15, curieux: 0.2 },
    ['Place de la République', 'Boulevard Voltaire'], 0.4),
  forces: forces({ sections: 4, fourgons: 10, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille personnes, ambiance de retrouvailles ; peu d\'organisation, beaucoup de bonne volonté.',
    'Aucun signalement ; quelques radicaux pourraient observer.',
    ['Place de la République', 'Boulevard Voltaire'],
    ['Ouvrir la liaison dès le premier jour', 'Relever les sections avant fatigue', 'Garder le drone en réserve pour la suite']),
  phases: [
    ph('rassemblement', 'Rassemblement', 'Les gilets jaunes s\'installent sur la place ; banderoles et musique.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Début de la semaine de mobilisation. Image publique à préserver. PARLEZ.']], []),
    ph('liaison', 'Liaison', 'Vous parlez au porte-parole : parcours, horaires, service d\'ordre.', T(480),
      [['LIAISON', 'MISTRAL ICI LIAISON. Accord sur un parcours déclaré pour mercredi. PARLEZ.']],
      ['Un groupe de jeunes arrive par le boulevard Voltaire']),
    ph('releve', 'Relève', 'Vous faites tourner les sections ; la fatigue se mesure.', T(720),
      [['MISTRAL 1', 'MISTRAL ICI MISTRAL UN. Section relevée, DEUX agents fatigués. PARLEZ.']], []),
    ph('fin', 'Dispersion', 'La place se vide ; rendez-vous demain.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Rassemblement terminé, aucun blessé. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Terminer le rassemblement sans emploi de la force', 'zero_bavure'),
    ob('o2', 'Conclure un accord de parcours avec les organisateurs', 'prevention', { target: 'liaison', count: 1 }),
    os('o3', 'Relever les sections avant qu\'elles ne soient épuisées', 'releve', { count: 2 }),
    os('o4', 'Garder l\'image publique au-dessus de soixante', 'personnalise', { target: 'image_publique', count: 60 }),
  ],
  failures: [fail('bavure_grave', 'Un geste de trop dès le premier jour pèsera toute la semaine.'), fail('trop_de_blesses', 'Trop de blessés.', 6)],
  randomEvents: ['Un camion de livraison bloque le boulevard Voltaire', 'Rumeur en ligne (tension +0,05)', 'Malaise d\'un participant', 'Averse de dix minutes'],
  unique: 'Le premier jour d\'une semaine qui s\'aggrave : on joue pour que les jours suivants restent jouables.',
  difficulty: 2, chapter: 8, tags: ['semaine', 'acte-1', 'campagne'],
});

/** Acte 2 — mercredi : première casse, boulevard Beaumarchais. */
export const SEMAINE_2 = mission({
  ...CDT,
  id: 'semaine-02-la-colere-monte',
  title: 'Semaine de mobilisation — Acte 2 : la colère monte',
  pitch: 'Mercredi, boulevard Beaumarchais : quinze cents personnes, des bonnets blancs en pointe et un premier feu de poubelle. Les agents de mardi ne sont déjà plus tout à fait frais.',
  briefing: [
    `Le deuxième jour, les « Routiers de Lutèce » ont rallié des syndicats fictifs et un mouvement sans organisateur, les « Bonnets Blancs ». Quinze cents personnes déclarées partent de la place de la Bastille par le boulevard Beaumarchais. Des opportunistes ont rejoint la tête de cortège, et la presse relaie un appel à « durcir ».`,
    `Vous commandez la compagnie, fatiguée par la veille. Votre mission est de tenir le parcours sans casse, de relever vos sections et de garder la liaison ouverte. Votre image publique de mardi se reporte ici : un geste de trop et la tension sera pire jeudi.`,
    `Trois sections en rues parallèles, une en réserve place des Vosges. Drone sur la tête de cortège. Cherchez les signes avant-coureurs : changements de tenue, parapluies, dépavage. Utilisez les relèves : votre première section a déjà tenu quatre heures hier.`,
    `La fatigue est une donnée : au-delà de vingt minutes de ligne, une section perd en précision. Une grenade lancée en rafale reviendra sur la ligne si le vent tourne. Gardez les munitions pour jeudi.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Beaumarchais', timeOfDay: 17, weather: 'couvert', windFrom: 270, windSpeed: 5,
  crowd: crowd(1500, 'carburants', 0.25, 0.4, 0.05, { gilets_jaunes: 0.45, syndical: 0.2, etudiants: 0.1, black_bloc: 0.05, familles: 0.1, curieux: 0.1 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard des Filles du Calvaire', 'Boulevard du Temple', 'Place de la République'], 0.45),
  forces: forces({ sections: 4, fourgons: 10, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Quinze cents personnes ; gilets jaunes en majorité, « Bonnets Blancs » en tête.',
    'Une trentaine d\'individus déterminés signalés par la presse locale.',
    ['Boulevard Beaumarchais', 'Rue Amelot', 'Place de la Bastille'],
    ['Retirer le mobilier urbain du parcours', 'Placer une réserve place des Vosges', 'Relever les sections à tour de rôle']),
  phases: [
    ph('depart', 'Départ de la Bastille', 'Le cortège s\'ébranle ; les « Bonnets Blancs » prennent la tête.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Cortège déclaré, parcours Bastille, République. Vos hommes ont été sollicités hier : gérez vos relèves. PARLEZ.']], []),
    ph('tension', 'Premiers signes', 'Parapluies et changements de tenue dans la tête ; un feu de poubelle.', TENS(0.4),
      [['ICARE', 'CENTRAL ICI ICARE. Parapluies ouverts, changements de tenue en tête. PARLEZ.']],
      ['Poubelle enflammée au milieu du boulevard']),
    ph('jets', 'Jets de projectiles', 'Quelques pavés et bouteilles sur la ligne.', FOULE('dispersion'),
      [['MISTRAL 2', 'MISTRAL ICI MISTRAL DEUX. Jets de projectiles, ligne tenue. PARLEZ.']],
      ['Une vitrine de banque brisée']),
    ph('fin', 'Arrivée à la République', 'Le cortège se disperse dans la nuit.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Dispersion effective. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Accompagner le cortège jusqu\'à la République', 'escorter', { place: 'Place de la République' }),
    ob('o2', 'Limiter les vitrines brisées à deux', 'limiter_degats', { max: 2 }),
    os('o3', 'Repérer les signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 2 }),
    os('o4', 'Relever les sections avant vingt minutes de ligne', 'releve', { count: 3 }),
  ],
  failures: [fail('bavure_grave', 'Un geste de trop sur le cortège déclaré.'), fail('trop_de_blesses', 'Trop de blessés.', 8)],
  randomEvents: ['Retour de gaz par vent tournant', 'Un agent isolé tombe à terre', 'Rumeur virale d\'un tir (tension +0,05)', 'Panne radio de soixante secondes'],
  unique: 'Première casse de la semaine : la fatigue de la veille commence à compter.',
  difficulty: 3, chapter: 8, tags: ['semaine', 'acte-2', 'campagne'],
});

/** Acte 3 — jeudi : les étudiants rejoignent, Place Saint-Michel. */
export const SEMAINE_3 = mission({
  ...CDT,
  id: 'semaine-03-les-etudiants',
  title: 'Semaine de mobilisation — Acte 3 : les étudiants',
  pitch: 'Jeudi, place Saint-Michel : deux mille personnes dont une moitié d\'étudiants, la colère des deux premiers jours et des sections qui n\'ont pas dormi.',
  briefing: [
    `La « Coordination Étudiante Rive Gauche » rejoint la mobilisation et appelle à un rassemblement place Saint-Michel, puis à une marche vers le boulevard Saint-Germain. Deux mille personnes sont attendues, majoritairement étudiants et lycéens. Des militants plus âgés se sont insérés dans le cortège.`,
    `Vous commandez la compagnie, déjà éprouvée. Votre mission est de garder le cortège sur le boulevard Saint-Michel, d'empêcher l'accès aux ponts de l'île de la Cité et de prévenir toute bousculade. Les tensions de mercredi pèsent : la rue attend un faux pas.`,
    `Deux sections place Saint-Michel, une sur le quai des Grands Augustins, une sur le boulevard Saint-Germain. Le drone repère les changements de tenue. La liaison avec la coordination est essentielle. Utilisez les relèves.`,
    `Les étudiants filment tout : l'image publique est un enjeu. Ne chargez pas un cortège assis. Gardez deux issues ouvertes pour la foule.`,
  ],
  type: 'manifestation_declaree', place: 'Place Saint-Michel', timeOfDay: 16, weather: 'nuageux', windFrom: 240, windSpeed: 4,
  crowd: crowd(2000, 'education', 0.35, 0.5, 0.08, { etudiants: 0.4, lyceens: 0.15, gilets_jaunes: 0.15, syndical: 0.15, black_bloc: 0.07, curieux: 0.08 },
    ['Place Saint-Michel', 'Boulevard Saint-Michel', 'Boulevard Saint-Germain', 'Pont Saint-Michel'], 0.55),
  forces: forces({ sections: 4, fourgons: 10, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux mille personnes, majorité d\'étudiants et de lycéens ; ambiance festive devenant revendicative.',
    'Une cinquantaine d\'individus déterminés, venus de plusieurs groupes.',
    ['Place Saint-Michel', 'Pont Saint-Michel', 'Boulevard Saint-Germain'],
    ['Tenir les ponts de la Cité', 'Garder deux issues ouvertes', 'Demander la liaison avec la coordination']),
  phases: [
    ph('rassemblement', 'Rassemblement', 'Les étudiants s\'installent autour de la fontaine.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Troisième jour, tension résiduelle. Gardez les ponts. PARLEZ.']], []),
    ph('marche', 'Marche vers Saint-Germain', 'La foule déborde sur le boulevard.', TENS(0.45),
      [['MISTRAL 3', 'MISTRAL ICI MISTRAL TROIS. Foule sur la chaussée, boulevard Saint-Germain. PARLEZ.']],
      ['Un groupe tente de monter sur le pont Saint-Michel']),
    ph('pression', 'Pression sur le pont', 'Des projectiles volent depuis le quai.', FOULE('dispersion'),
      [['ICARE', 'CENTRAL ICI ICARE. Groupe de SOIXANTE sur le quai. PARLEZ.']],
      ['Barricade de vélos et de trottinettes enflammée']),
    ph('fin', 'Dispersion', 'La foule se dilue dans les rues voisines.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Place dégagée. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Interdire l\'accès au pont Saint-Michel', 'tenir_position', { place: 'Pont Saint-Michel', seconds: 900 }),
    ob('o2', 'Prévenir toute bousculade grave', 'limiter_blesses', { max: 4 }),
    os('o3', 'Éteindre la barricade de trottinettes avant qu\'elle ne rebrûle', 'eteindre', { target: 'barricade_electrique' }),
    os('o4', 'Garder l\'image publique au-dessus de cinquante', 'personnalise', { target: 'image_publique', count: 50 }),
  ],
  failures: [fail('ligne_enfoncee', 'Le pont est franchi.'), fail('trop_de_blesses', 'Trop de blessés.', 10)],
  randomEvents: ['Une trottinette électrique embrasée projette des étincelles', 'Un étudiant tombe à terre', 'Un journaliste réclame le passage', 'Retour de gaz par vent tournant'],
  unique: 'Les barricades électriques apparaissent : batteries de vélos et de trottinettes qui se rallument.',
  difficulty: 3, chapter: 8, tags: ['semaine', 'acte-3', 'campagne'],
});

/** Acte 4 — vendredi : le blocage, rue Royale. */
export const SEMAINE_4 = mission({
  ...CDT,
  id: 'semaine-04-le-blocage',
  title: 'Semaine de mobilisation — Acte 4 : le blocage',
  pitch: 'Vendredi, place de la Madeleine : un blocage non déclaré de la rue Royale, deux mille cinq cents personnes et un commerce de luxe en vitrine.',
  briefing: [
    `Le vendredi, les « Routiers de Lutèce » décrètent un « blocage » du quartier des boutiques de luxe, place de la Madeleine et rue Royale. Deux mille cinq cents personnes sont attendues, dont un noyau radicalisé par les journées précédentes. La rue Royale mène à la Concorde et à l'Assemblée nationale.`,
    `Vous commandez la compagnie, fatiguée, avec le renfort d'un Centaure et d'un canon à eau. Votre mission est d'interdire la rue Royale, de protéger les boutiques et l'Assemblée, et d'éviter que la fatigue de vos sections ne provoque un incident.`,
    `Deux sections sur la place de la Madeleine, une rue Royale, une sur le boulevard Malesherbes. Centaure en réserve, canon à eau au débouché du boulevard. Les relèves sont une obligation : une section qui tient une ligne trop longtemps perd sa précision.`,
    `Les images de la veille circulent. Aucun tir tendu, aucun geste hors cadre. L'écharpe tricolore ne protège pas d'un geste filmé. Tenez : la semaine n'est pas finie.`,
  ],
  type: 'manifestation_interdite', place: 'Place de la Madeleine', timeOfDay: 15, weather: 'couvert', windFrom: 280, windSpeed: 5,
  crowd: crowd(2500, 'carburants', 0.45, 0.65, 0.12, { gilets_jaunes: 0.4, black_bloc: 0.12, syndical: 0.15, etudiants: 0.13, curieux: 0.2 },
    ['Boulevard Malesherbes', 'Place de la Madeleine', 'Rue Royale', 'Place de la Concorde'], 0.5),
  forces: forces({ sections: 4, fourgons: 10, centaure: 1, canonEau: 1, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux mille cinq cents personnes, ambiance dure ; les groupes radicaux sont mieux organisés.',
    'Une centaine d\'individus déterminés, avec protections, venus de plusieurs quartiers.',
    ['Place de la Madeleine', 'Rue Royale', 'Boulevard Malesherbes'],
    ['Fermer la rue Royale dès midi', 'Relever les sections toutes les vingt minutes', 'Placer le canon à eau au débouché']),
  phases: [
    ph('bouclage', 'Bouclage de la rue Royale', 'Les sections se mettent en ligne ; véhicules en travers.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Mission : INTERDIRE la rue Royale. Cadre : manifestation interdite. FAITES L\'APERÇU.']], []),
    ph('arrivee', 'Arrivée par vagues', 'Les premiers groupes arrivent par le boulevard Malesherbes.', TENS(0.5),
      [['ICARE', 'CENTRAL ICI ICARE. Groupe de TROIS cents arrive par le boulevard Malesherbes, banderole renforcée. PARLEZ.']],
      ['Jets de bouteilles sur la ligne']),
    ph('assaut', 'Assaut sur la ligne', 'Pavés, mortiers, cocktails sur le barrage de la rue Royale.', FOULE('dispersion'),
      [['MISTRAL 1', 'MISTRAL ICI MISTRAL UN. Assaut sur la ligne, DEUX agents à terre. PARLEZ.']],
      ['Un agent isolé est mis à terre']),
    ph('fin', 'Reflux', 'Les groupes refluent par le boulevard Malesherbes.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Ligne tenue. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Interdire la rue Royale pendant toute la mission', 'tenir_position', { place: 'Rue Royale', seconds: 1200 }),
    ob('o2', 'Dégager les agents blessés sans laisser la ligne se rompre', 'secourir', { target: 'agent_a_terre', count: 2 }),
    os('o3', 'Relever les sections avant fatigue', 'releve', { count: 3 }),
    os('o4', 'Limiter les vitrines brisées à quatre', 'limiter_degats', { max: 4 }),
  ],
  failures: [fail('ligne_enfoncee', 'La rue Royale est franchie.'), fail('trop_de_blesses', 'Trop de blessés parmi les agents.', 10)],
  randomEvents: ['Une section en relève en retard', 'Un cocktail incendiaire touche un fourgon', 'Panne radio de soixante secondes', 'Vent tournant'],
  unique: 'La fatigue cumulée devient un adversaire : une relève en retard peut coûter la ligne.',
  difficulty: 4, chapter: 8, tags: ['semaine', 'acte-4', 'campagne'],
});

/** Acte 5 — samedi : le grand jour des Champs-Élysées. */
export const SEMAINE_5 = mission({
  ...CDT,
  id: 'semaine-05-le-samedi',
  title: 'Semaine de mobilisation — Acte 5 : le samedi',
  pitch: 'Samedi, avenue des Champs-Élysées : trois mille personnes, un mot d\'ordre de « marche sur l\'Élysée » et des sections à bout de souffle.',
  briefing: [
    `Le samedi est le jour fort de la semaine. Trois mille personnes convergent vers les Champs-Élysées, appelées à marcher vers l'Élysée. L'avenue est interdite à toute manifestation par arrêté préfectoral. Les renseignements signalent un bloc de deux cents individus décidés, des armes de fortune et des véhicules à incendier.`,
    `Vous commandez toute la compagnie, avec le Centaure, le canon à eau et le drone. Votre mission est de tenir les débouchés de l'avenue sur la place de la Concorde, de protéger le palais, de garder des secours disponibles et de ne pas craquer.`,
    `Deux sections au rond-point des Champs-Élysées, deux sur l'avenue Matignon, canon à eau en retrait. Centaure en réserve. Faites prononcer les sommations dans les formes, puis refoulez par bonds. Gardez la liaison avec les organisateurs jusqu'au bout.`,
    `Les trois jours précédents ont laissé des traces : chaque agent compte. Un geste hors cadre aujourd'hui fait basculer toute la semaine.`,
  ],
  type: 'manifestation_interdite', place: 'Avenue des Champs-Élysées', timeOfDay: 14.5, weather: 'nuageux', windFrom: 260, windSpeed: 5,
  crowd: crowd(3000, 'carburants', 0.55, 0.75, 0.15, { gilets_jaunes: 0.45, black_bloc: 0.15, syndical: 0.1, etudiants: 0.1, curieux: 0.2 },
    ['Avenue des Champs-Élysées', 'Rond-Point des Champs-Élysées - Marcel Dassault', 'Avenue Matignon', 'Place de la Concorde'], 0.55),
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, canonEau: 1, bravm: 3, drone: true, pompiers: 3, samu: 2 }),
  intel: intel(
    'Trois mille personnes ; le gros du cortège reste calme, un noyau est préparé.',
    'Deux cents individus décidés, avec protections, mortiers et cocktails.',
    ['Avenue des Champs-Élysées', 'Rond-Point des Champs-Élysées - Marcel Dassault', 'Avenue Matignon'],
    ['Fermer la circulation avant midi', 'Retirer le mobilier urbain de l\'avenue', 'Placer le canon à eau au rond-point']),
  phases: [
    ph('mise-en-place', 'Mise en place', 'Les sections prennent position ; les fourgons s\'alignent.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Samedi, jour fort. Tenir la Concorde. FAITES L\'APERÇU.']], []),
    ph('arrivee', 'Arrivée des cortèges', 'Les groupes descendent l\'avenue ; la foule dense avance.', TENS(0.55),
      [['ICARE', 'CENTRAL ICI ICARE. Tête de cortège à QUATRE cents mètres. Bloc visible, DEUX cents individus. PARLEZ.']],
      ['Un véhicule est retourné et incendié']),
    ph('affrontement', 'Affrontement', 'Le bloc attaque la ligne à tir tendu ; la foule suit.', FOULE('dispersion'),
      [['MISTRAL 2', 'MISTRAL ICI MISTRAL DEUX. Assaut sur la ligne, jets de mortiers. Je demande sommations et emploi de la force. PARLEZ.']],
      ['Barricade enflammée au rond-point']),
    ph('fin', 'Dispersion', 'Les groupes refluent vers l\'Étoile.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Rond-point tenu. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Interdire l\'accès à la place de la Concorde', 'tenir_position', { place: 'Place de la Concorde', seconds: 1500 }),
    ob('o2', 'Prononcer les sommations dans les formes avant la force', 'sommations_regulieres', { count: 3 }),
    os('o3', 'Éteindre les véhicules incendiés', 'eteindre', { target: 'vehicule', count: 2 }),
    os('o4', 'Garder l\'image publique au-dessus de quarante', 'personnalise', { target: 'image_publique', count: 40 }),
  ],
  failures: [fail('ligne_enfoncee', 'La Concorde est atteinte.'), fail('bavure_grave', 'Faute grave filmée : l\'enquête de l\'IGPN s\'ajoute à la semaine.')],
  randomEvents: ['Retour de gaz par vent tournant', 'Un agent est mis à terre', 'Une ambulance demande le passage', 'Rumeur virale (tension +0,05)'],
  unique: 'Le samedi concentre toute la semaine : fatigue, image publique et colère de la rue.',
  difficulty: 5, chapter: 8, tags: ['semaine', 'acte-5', 'campagne'],
});

/** Acte 6 — dimanche soir : l'acte final, nuit, Concorde. */
export const SEMAINE_6 = mission({
  ...CDT,
  id: 'semaine-06-dernier-acte',
  title: 'Semaine de mobilisation — Acte 6 : le dernier acte',
  pitch: 'Dimanche soir, place de la Concorde : deux mille personnes, la nuit et une semaine d\'accumulation. L\'issue dépend de tout ce que vous avez fait.',
  briefing: [
    `Le dimanche soir, la mobilisation se rassemble à la Concorde pour un « dernier acte ». Deux mille personnes, parmi lesquelles beaucoup d'éprouvés de la semaine. Un petit groupe cherche l'embrasement. Les commerçants du quartier ont baissé leurs rideaux.`,
    `Vous commandez la compagnie, épuisée. Votre mission est de protéger la Concorde, de maintenir l'accès de l'Assemblée nationale et de laisser retomber la tension. Le bilan de la semaine s'écrit ce soir : si vous tenez, la mobilisation s'éteint ; si vous cédez à la violence, elle repart.`,
    `Deux sections à la Concorde, une sur la rue Royale, une sur le cours la Reine. Canon à eau et Centaure en réserve. Utilisez la liaison avec les organisateurs jusqu'à la dernière minute. Priorité à la désescalade.`,
    `La nuit joue contre vous : les coups ne se voient pas, les images circulent. Aucun tir sans sommations. Si vous êtes épuisé, remplacez votre adjoint : c'est la dernière ligne droite.`,
  ],
  type: 'manifestation_interdite', place: 'Place de la Concorde', timeOfDay: 20.5, weather: 'pluie', windFrom: 250, windSpeed: 5,
  crowd: crowd(2000, 'carburants', 0.6, 0.8, 0.15, { gilets_jaunes: 0.4, black_bloc: 0.15, syndical: 0.1, etudiants: 0.15, curieux: 0.2 },
    ['Avenue des Champs-Élysées', 'Place de la Concorde', 'Rue Royale', 'Cours la Reine'], 0.3),
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, canonEau: 1, bravm: 3, drone: true, pompiers: 3, samu: 2 }),
  intel: intel(
    'Deux mille personnes, fatigue visible des deux côtés ; la nuit tombe.',
    'Une centaine d\'individus déterminés, organisés en petits groupes mobiles.',
    ['Place de la Concorde', 'Rue Royale', 'Cours la Reine'],
    ['Relever les sections à tour de rôle', 'Garder les secours prêts', 'Demander la liaison dès l\'arrivée']),
  phases: [
    ph('veillee', 'Rassemblement du soir', 'Les groupes s\'installent sous la pluie ; bougies et banderoles.', T(300),
      [['CENTRAL', 'MISTRAL ICI CENTRAL. Dernier acte. Bilan de la semaine en jeu. PARLEZ.']], []),
    ph('montee', 'Montée de la tension', 'Un groupe cherche l\'embrasement.', TENS(0.55),
      [['ICARE', 'CENTRAL ICI ICARE. Groupe de QUATRE-VINGTS en tête, mouvement vers la rue Royale. PARLEZ.']],
      ['Feu de barricade sur le cours la Reine']),
    ph('assaut', 'Assaut nocturne', 'Mortiers et pavés sur la ligne ; vitrines brisées.', FOULE('dispersion'),
      [['MISTRAL 1', 'MISTRAL ICI MISTRAL UN. Assaut sur la rue Royale. PARLEZ.']],
      ['Un fourgon est incendié']),
    ph('fin', 'Retour au calme', 'La pluie et la fatigue vident la place.', FIN, [['MISTRAL', 'CENTRAL ICI MISTRAL. Concorde libre, semaine terminée. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Protéger la place de la Concorde jusqu\'à la fin de la mission', 'proteger_site', { place: 'Place de la Concorde' }),
    ob('o2', 'Terminer la semaine sans faute grave', 'zero_bavure'),
    os('o3', 'Traiter les trois feux de la place', 'traiter_incidents', { target: 'feu', count: 3 }),
    os('o4', 'Garder une image publique supérieure à quarante', 'personnalise', { target: 'image_publique', count: 40 }),
  ],
  failures: [fail('ligne_enfoncee', 'La Concorde est envahie.'), fail('bavure_grave', 'Faute grave en fin de semaine : sanction exemplaire.')],
  randomEvents: ['Panne radio de soixante secondes', 'Un agent s\'effondre d\'épuisement', 'Un journaliste réclame la sortie', 'Un enfant perdu dans la foule'],
  unique: 'Le bilan de la semaine s\'écrit sur une seule soirée, avec la fatigue de tous les actes précédents.',
  difficulty: 5, chapter: 8, tags: ['semaine', 'acte-6', 'campagne'],
});

/** Les six actes de la campagne, dans l'ordre. */
export const SEMAINE: MissionDef[] = [SEMAINE_1, SEMAINE_2, SEMAINE_3, SEMAINE_4, SEMAINE_5, SEMAINE_6];
