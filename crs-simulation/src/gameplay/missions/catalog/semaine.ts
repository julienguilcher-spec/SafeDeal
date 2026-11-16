/* =====================================================================================
 * Catalogue — campagne « semaine de mobilisation » (six actes du commandant).
 * La fatigue des unités, les blessés, l'image publique et la colère de la rue se reportent
 * d'un acte au suivant : la tension de départ monte à chaque jour.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';

const CDT: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'commandant', poste: 'commandant_unite' };

/** Acte 1 — mardi : la première journée, encore calme. */
export const SEMAINE_1 = mission({
  ...CDT,
  id: 'semaine-01-premier-appel',
  title: 'Semaine de mobilisation — Acte 1 : le premier appel',
  pitch: 'Mardi, place de la République : mille personnes répondent à l\'appel contre la « taxe Bitume » sur les carburants. Tout semble calme. Rien ne le restera.',
  briefing: [
    `Une coalition d'automobilistes et d'artisans, les « Routiers de Lutèce », appelle à une semaine de mobilisation contre la « taxe Bitume » sur les carburants. Le premier rassemblement est déclaré place de la République, mardi à 18 h. Mille personnes sont attendues, en gilet jaune pour beaucoup, dans une ambiance de reprise de contact.`,
    `Vous commandez la compagnie pour toute la semaine : fatigue des agents, blessés, image publique et colère de la rue se reportent d'un jour à l'autre. Votre mission du jour est de tenir un rassemblement calme sans le crisper, et de poser dès maintenant les bases : liaison avec les organisateurs, réserves hors de vue, relève prévue pour les jours suivants.`,
    `Deux sections visibles sur la place, deux en réserve rue du Faubourg-du-Temple. Ouvrez la liaison avec les organisateurs et obtenez leur engagement sur le parcours des jours suivants. Rendez compte à la salle toutes les dix minutes. Relevez les sections qui ont tenu vingt minutes de ligne.`,
    `Ne cherchez pas l'affrontement : chaque geste de trop se paiera toute la semaine, en tension de départ pour les actes suivants. L'objectif du mardi est d'arriver mercredi avec une image publique intacte et des agents reposés.`,
  ],
  type: 'manifestation_declaree', place: 'Place de la République', timeOfDay: 18, weather: 'clair', windFrom: 260, windSpeed: 3,
  crowd: crowd(1000, 'carburants', 0.1, 0.25, 0.02, { gilets_jaunes: 0.55, syndical: 0.1, familles: 0.15, curieux: 0.2 },
    ['Place de la République', 'Boulevard Voltaire'], 0.4),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille personnes, ambiance de retrouvailles ; peu d\'organisation, beaucoup de bonne volonté.',
    'Aucun signalement ; quelques radicaux pourraient observer.',
    ['Place de la République', 'Boulevard Voltaire'],
    ['Ouvrir la liaison dès le premier jour', 'Relever les sections avant fatigue', 'Garder le drone en réserve pour la suite']),
  phases: [
    ph('mardi', `Mardi, dix-huit heures`,
      `Mardi, dix-huit heures, place de la République. Les « Routiers de Lutèce » arrivent par le métro et par le boulevard Voltaire, gilets jaunes annotés au marqueur, thermos et pancartes contre la « taxe Bitume ». Deux de vos sections sont visibles sur la place, deux en réserve rue du Faubourg du Temple ; personne n'a encore de raison de se méfier de personne.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `Premier jour d'une semaine de mobilisation. Rassemblement déclaré, statique. Ce que vous ferez ce soir pèsera sur les cinq jours suivants.`, 'T'),
        rad('ICARE', 'MISTRAL', `HUIT-ZÉRO-ZÉRO personnes sur la place, arrivées continues par le métro. Ambiance calme, beaucoup de familles.`),
      ], [`Un camion de livraison bloque le boulevard Voltaire`]),
    ph('porte-parole', `Le porte-parole des Routiers`,
      `Au pied de la statue de la République, le porte-parole des « Routiers de Lutèce » accepte de vous parler, entouré de trois artisans en gilet. Ils n'ont jamais organisé de manifestation ; ils veulent marcher demain et ne savent pas ce qu'est une déclaration. C'est maintenant que se fixent le parcours de mercredi, l'horaire et le nom de celui qu'on appelle quand ça dérape.`,
      OBJ('o2'), [
        rad('LIAISON', 'MISTRAL', `Le porte-parole est prêt à vous rencontrer au pied de la statue. Il veut marcher demain de la Bastille à la République. Rien n'est déclaré.`),
        voix('PORTE-PAROLE DES ROUTIERS', `On n'est pas des professionnels de la manif, nous. Dites-nous ce qu'il faut signer, et où on a le droit de marcher.`),
      ], [`Un groupe de jeunes arrive par le boulevard Voltaire`]),
    ph('releves', `Vingt minutes de ligne, pas plus`,
      `L'accord est conclu pour mercredi. Sur la place de la République, les sections visibles tiennent depuis vingt minutes et commencent à piétiner ; celles de la rue du Faubourg du Temple n'ont encore rien fait. Une relève ne change rien ce soir : elle comptera vendredi, quand les mêmes agents en seront à leur quatrième jour.`,
      T(300), [
        rad('MISTRAL 1', 'MISTRAL', `DEUX-ZÉRO minutes de ligne pour ma section. Rien à signaler, mais mes agents piétinent. Relève possible ?`),
        rad('CENTRAL', 'MISTRAL', `Rumeur en ligne : un blessé grave place de la République. Confirmez ou démentez.`),
      ], [`Rumeur d'un blessé grave relayée en ligne`, `Malaise d'un participant près de la statue`, `Averse de dix minutes`]),
    ph('a-demain', `À demain, à la Bastille`,
      `La nuit tombe et la place de la République se vide par le métro, sans qu'il soit besoin de le demander. Le porte-parole vous salue de loin en repliant sa banderole. Les sections rentrent aux fourgons : ce qu'elles n'ont pas dépensé ce soir, elles l'auront demain.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin du premier jour. Demain : cortège de la Bastille à la République. Rendez compte de l'état de vos sections.`),
        rad('LIAISON', 'MISTRAL', `Le porte-parole vous fait dire qu'il tiendra sa parole demain, si vous tenez la vôtre.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Terminer le rassemblement sans emploi de la force', 'zero_bavure'),
    ob('o2', 'Conclure un accord de parcours avec les organisateurs', 'prevention', { target: 'liaison', count: 1 }),
    os('o3', 'Relever les sections avant qu\'elles ne soient épuisées', 'releve', { count: 2 }),
    os('o4', 'Garder l\'image publique au-dessus de soixante', 'personnalise', { target: 'image_publique', count: 60 }),
  ],
  failures: [fail('bavure_grave', 'Un geste de trop dès le premier jour pèsera toute la semaine.'), fail('trop_de_blesses', 'Trop de blessés.', 6)],
  randomEvents: ['Un camion de livraison bloque le boulevard Voltaire', 'Rumeur d\'un blessé grave relayée en ligne', 'Malaise d\'un participant', 'Averse de dix minutes'],
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
    `Le deuxième jour, les « Routiers de Lutèce » ont rallié plusieurs organisations syndicales et un mouvement sans organisateur, les « Bonnets Blancs ». Quinze cents personnes déclarées partent de la place de la Bastille par le boulevard Beaumarchais. Des opportunistes ont rejoint la tête de cortège, et la presse relaie un appel à « durcir ».`,
    `Vous commandez la compagnie, fatiguée par la veille. Votre mission est de tenir le parcours sans casse, de relever vos sections et de garder la liaison ouverte. Votre image publique de mardi se reporte ici : un geste de trop et la tension sera pire jeudi.`,
    `Trois sections en rues parallèles, une en réserve place des Vosges. Drone sur la tête de cortège. Cherchez les signes avant-coureurs : changements de tenue, parapluies, dépavage. Utilisez les relèves : votre première section a déjà tenu quatre heures hier.`,
    `La fatigue est une donnée : au-delà de vingt minutes de ligne, une section perd en précision. Une grenade lancée en rafale reviendra sur la ligne si le vent tourne. Gardez les munitions pour jeudi.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Beaumarchais', timeOfDay: 17, weather: 'couvert', windFrom: 270, windSpeed: 5,
  crowd: crowd(1500, 'carburants', 0.25, 0.4, 0.05, { gilets_jaunes: 0.45, syndical: 0.2, etudiants: 0.1, black_bloc: 0.05, familles: 0.1, curieux: 0.1 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard des Filles du Calvaire', 'Boulevard du Temple', 'Place de la République'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Quinze cents personnes ; gilets jaunes en majorité, « Bonnets Blancs » en tête.',
    'Une trentaine d\'individus déterminés signalés par la presse locale.',
    ['Boulevard Beaumarchais', 'Rue Amelot', 'Place de la Bastille'],
    ['Retirer le mobilier urbain du parcours', 'Placer une réserve place des Vosges', 'Relever les sections à tour de rôle']),
  phases: [
    ph('depart-bastille', `Mercredi, départ de la Bastille`,
      `Mercredi, dix-sept heures, place de la Bastille. Le cortège déclaré la veille s'ébranle vers le boulevard Beaumarchais : quinze cents personnes, les « Routiers de Lutèce », des chasubles syndicales et, en tête, un mouvement sans organisateur, les « Bonnets Blancs », que personne n'avait invité. Trois sections suivent par les rues parallèles, la quatrième attend place des Vosges.`,
      FOULE('cortege'), [
        rad('CENTRAL', 'MISTRAL', `Cortège déclaré, parcours Bastille, République. Vos sections ont été sollicitées hier : organisez vos relèves.`),
        rad('LIAISON', 'MISTRAL', `Le porte-parole des Routiers est avec nous. Il dit qu'il ne connaît pas les Bonnets Blancs et qu'il ne les tient pas.`),
      ], [`Des inconnus prennent la tête du cortège`]),
    ph('signes', `Les signes dans la tête de cortège`,
      `Sur le boulevard Beaumarchais, à hauteur de la rue du Pas de la Mule, la tête ralentit sans raison. Le drone montre des parapluies qui s'ouvrent par temps sec, des sacs qui passent de main en main, trois silhouettes accroupies sur la chaussée. Rien n'est encore arrivé : c'est le moment où l'on peut encore choisir quoi faire.`,
      TENS(0.4), [
        rad('ICARE', 'MISTRAL', `Parapluies ouverts et changements de tenue en tête, DEUX-ZÉRO personnes. Trois individus accroupis sur la chaussée : ils descellent quelque chose.`),
        rad('MISTRAL 2', 'MISTRAL', `Ma section en est à DEUX-ZÉRO minutes de marche en parallèle, après les QUATRE heures d'hier. Je tiens, mais pas longtemps.`),
      ], [`Des parapluies s'ouvrent dans la tête de cortège`, `Des pavés sont descellés sur le boulevard`]),
    ph('premiere-casse', `La première casse de la semaine`,
      `La tension monte : une poubelle s'enflamme au milieu du boulevard Beaumarchais, puis la vitrine d'une agence bancaire tombe sous les coups de marteau. Quelques pavés volent vers la section la plus proche. Derrière, le gros du cortège crie « Pas de casse ! » et s'arrête.`,
      T(240), [
        rad('MISTRAL 3', 'MISTRAL', `Jets de pavés et de bouteilles sur ma section, une dizaine d'auteurs. Je tiens la ligne. Vos ordres ?`),
        rad('LIAISON', 'MISTRAL', `Les Routiers demandent que vous les débarrassiez des casseurs sans toucher à leur cortège. Ils ont arrêté leur banderole.`),
      ], [`Une poubelle est enflammée au milieu du boulevard`, `La vitrine d'une banque est brisée`, `Un agent isolé tombe à terre`]),
    ph('jusqu-a-la-republique', `Jusqu'à la République, vent de face`,
      `Il reste le boulevard des Filles du Calvaire et le boulevard du Temple avant la place de la République. Le cortège est reparti, plus nerveux ; une rumeur de tir court sur les téléphones, et le vent d'ouest forcit : une grenade lancée ici reviendrait sur vos lignes. Les munitions économisées ce soir serviront jeudi.`,
      OBJ('o1'), [
        rad('CENTRAL', 'MISTRAL', `Rumeur virale d'un tir sur le cortège. La salle a besoin de votre version dans la minute.`),
        rad('MISTRAL 1', 'MISTRAL', `Vent de face, CINQ mètres par seconde. Si vous ordonnez du gaz, il revient sur moi.`),
      ], [`Rumeur virale d'un tir`, `Panne radio de soixante secondes`]),
    ph('mercredi-soir', `Mercredi soir, l'appel à durcir`,
      `Le cortège est arrivé place de la République et se disperse à la nuit, par le métro et le boulevard Voltaire. Sur le boulevard Beaumarchais restent une vitrine à garder et des pavés à signaler ; dans les fourgons, des agents qui ont marché deux jours de suite. La presse, elle, relaie déjà l'appel à « durcir » jeudi.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Deuxième jour terminé. Demain : les étudiants, place Saint-Michel. Rendez compte : vitrines, blessés, munitions restantes.`),
        rad('MISTRAL 2', 'MISTRAL', `Section regroupée. Je vous transmets l'état de fatigue de mes agents pour la relève de demain.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Accompagner le cortège jusqu\'à la République', 'escorter', { place: 'Place de la République' }),
    ob('o2', 'Limiter les vitrines brisées à deux', 'limiter_degats', { max: 2 }),
    os('o3', 'Repérer les signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 2 }),
    os('o4', 'Relever les sections avant vingt minutes de ligne', 'releve', { count: 3 }),
  ],
  failures: [fail('bavure_grave', 'Un geste de trop sur le cortège déclaré.'), fail('trop_de_blesses', 'Trop de blessés.', 8)],
  randomEvents: ['Retour de gaz par vent tournant', 'Un agent isolé tombe à terre', 'Rumeur virale d\'un tir', 'Panne radio de soixante secondes'],
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
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux mille personnes, majorité d\'étudiants et de lycéens ; ambiance festive devenant revendicative.',
    'Une cinquantaine d\'individus déterminés, venus de plusieurs groupes.',
    ['Place Saint-Michel', 'Pont Saint-Michel', 'Boulevard Saint-Germain'],
    ['Tenir les ponts de la Cité', 'Garder deux issues ouvertes', 'Demander la liaison avec la coordination']),
  phases: [
    ph('fontaine', `Jeudi, autour de la fontaine`,
      `Jeudi, seize heures. La « Coordination Étudiante Rive Gauche » remplit la place Saint-Michel autour de la fontaine : étudiants, lycéens, quelques gilets jaunes de la veille. Deux sections sur la place, une quai des Grands Augustins, une boulevard Saint-Germain ; derrière vous, le pont Saint-Michel et l'île de la Cité, où personne ne doit passer.`,
      FOULE('depart'), [
        rad('CENTRAL', 'MISTRAL', `Troisième jour. Rassemblement déclaré place Saint-Michel, puis marche vers le boulevard Saint-Germain. Les ponts de l'île de la Cité restent interdits.`, 'A'),
        rad('LIAISON', 'MISTRAL', `La coordination étudiante accepte la liaison. Elle prévient : beaucoup de lycéens, et des militants plus âgés qu'elle ne connaît pas.`),
      ], [`Des militants plus âgés s'insèrent dans le rassemblement`]),
    ph('debordement', `La foule déborde sur le boulevard`,
      `La marche part par le boulevard Saint-Michel et déborde aussitôt sur toute la chaussée, trottoirs compris. Les téléphones filment tout, tout le temps ; un groupe s'assoit devant vos boucliers en chantant, un autre teste l'entrée du pont.`,
      TENS(0.45), [
        rad('MISTRAL 3', 'MISTRAL', `Foule sur toute la chaussée, boulevard Saint-Germain. Une centaine de personnes se sont assises devant ma ligne. Calme.`),
        rad('MISTRAL 1', 'MISTRAL', `Un groupe tente de monter sur le pont Saint-Michel par le trottoir. Je le repousse à la voix.`),
      ], [`Un groupe tente de monter sur le pont Saint-Michel`, `Des étudiants s'assoient devant la ligne`]),
    ph('quai', `Les projectiles du quai`,
      `La tension a monté. Depuis le quai des Grands Augustins, soixante individus lancent des bouteilles sur la section du pont, par-dessus les étudiants assis. Entre les lanceurs et vos boucliers, des lycéens qui ne savent plus dans quel sens courir.`,
      T(200), [
        rad('ICARE', 'MISTRAL', `Groupe de SIX-ZÉRO sur le quai des Grands Augustins, visages couverts, jets de bouteilles vers le pont. Des lycéens entre eux et votre ligne.`),
        rad('MISTRAL 1', 'MISTRAL', `Projectiles sur le pont Saint-Michel. Je tiens. Je ne peux rien lancer sans toucher les lycéens.`),
      ], [`Jets de bouteilles depuis le quai`, `Un étudiant tombe à terre dans la bousculade`]),
    ph('barricade-electrique', `La barricade qui se rallume`,
      `Boulevard Saint-Germain, une barricade de vélos et de trottinettes en libre-service s'embrase d'un coup. Les batteries crépitent, projettent des étincelles à dix mètres et se rallument dès qu'on les croit éteintes ; la fumée noire descend vers la place Saint-Michel et la foule reflue vers le pont.`,
      T(200), [
        rad('MISTRAL 3', 'MISTRAL', `Barricade de vélos et de trottinettes en feu boulevard Saint-Germain. Les batteries explosent, mon extincteur n'y fait rien. Je demande les pompiers.`),
        rad('SAPEUR 1', 'MISTRAL', `En attente boulevard Saint-Michel. Je m'engage si vous me donnez un couloir et une protection.`),
      ], [`Une barricade de vélos et de trottinettes est enflammée`, `Une batterie de trottinette projette des étincelles`, `Retour de gaz par vent tournant`]),
    ph('pont', `Quinze minutes sur le pont Saint-Michel`,
      `Tout reflue vers le pont Saint-Michel : ceux qui fuient la fumée, ceux qui veulent passer, ceux qui poussent derrière. La ligne du pont doit tenir sans devenir un mur contre lequel on s'écrase ; deux issues doivent rester ouvertes, par le quai et par le boulevard Saint-Michel.`,
      OBJ('o1'), [
        rad('ICARE', 'MISTRAL', `Densité en hausse à l'entrée du pont Saint-Michel. Les issues du quai et du boulevard Saint-Michel sont encore libres.`),
        rad('MISTRAL 1', 'MISTRAL', `Poussée sur le pont, sans coups pour l'instant. Si vous fermez le quai, ils n'auront plus que moi devant eux.`),
      ], [`Un journaliste réclame le passage sur le pont`, `Compression à l'entrée du pont`]),
    ph('jeudi-soir', `Jeudi soir, les images`,
      `Le pont Saint-Michel a tenu. La foule se dilue dans les rues du Quartier latin, et les images de la journée partent vers des milliers d'écrans : ce qu'elles montrent de vos sections décidera de la couleur du vendredi.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Troisième jour terminé. Demain : blocage annoncé place de la Madeleine. Les vidéos d'aujourd'hui circulent déjà. Rendez compte.`),
        rad('LIAISON', 'MISTRAL', `La coordination étudiante dit qu'elle ne sera pas là demain. Ceux qui restent, elle ne les connaît pas.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Interdire l\'accès au pont Saint-Michel', 'tenir_position', { place: 'Pont Saint-Michel', seconds: 900 }),
    ob('o2', 'Prévenir toute bousculade grave', 'limiter_blesses', { max: 4 }),
    os('o3', 'Éteindre la barricade de trottinettes avant qu\'elle ne rebrûle', 'eteindre', { target: 'barricade_electrique', count: 1 }),
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
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, canonEau: 1, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux mille cinq cents personnes, ambiance dure ; les groupes radicaux sont mieux organisés.',
    'Une centaine d\'individus déterminés, avec protections, venus de plusieurs quartiers.',
    ['Place de la Madeleine', 'Rue Royale', 'Boulevard Malesherbes'],
    ['Fermer la rue Royale dès midi', 'Relever les sections toutes les vingt minutes', 'Placer le canon à eau au débouché']),
  phases: [
    ph('vendredi', `Vendredi, la rue Royale en travers`,
      `Vendredi, quinze heures. Le « blocage » des boutiques de luxe est interdit par arrêté. Deux sections sur la place de la Madeleine, une en travers de la rue Royale, une boulevard Malesherbes ; le canon à eau au débouché du boulevard, le Centaure en réserve. Vos agents en sont à leur quatrième jour.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Mission : INTERDIRE la rue Royale. Cadre : manifestation interdite. Vous disposez de NEPTUNE UN et de CENTAURE UN.`, 'A'),
        rad('MISTRAL 3', 'MISTRAL', `En ligne rue Royale. Quatrième jour pour mes agents : je vous demande une relève toutes les DEUX-ZÉRO minutes.`),
      ], [`Une section annonce sa fatigue dès la mise en place`]),
    ph('vagues-malesherbes', `Les vagues du boulevard Malesherbes`,
      `Les premiers groupes arrivent par le boulevard Malesherbes et par la station Madeleine, gilets jaunes en tête, puis une banderole renforcée portée à six. Ils savent où est le barrage : ils viennent le voir, le toucher, le filmer.`,
      TENS(0.55), [
        rad('ICARE', 'MISTRAL', `Groupe de TROIS-ZÉRO-ZÉRO par le boulevard Malesherbes, banderole renforcée en tête. Arrivées continues à la station Madeleine.`),
        rad('CENTRAL', 'MISTRAL', `La station Madeleine peut être fermée sur votre demande. Les stations voisines recevront le flux.`),
      ], [`Arrivées par vagues à la station Madeleine`, `Jets de bouteilles sur la ligne`]),
    ph('assaut', `L'assaut sur le barrage`,
      `La tension vient de franchir un seuil. Pavés, mortiers d'artifice à tir tendu, engins incendiaires : le noyau radicalisé par la semaine se jette sur le barrage de la rue Royale. Deux agents tombent devant la ligne ; il faut aller les chercher sans que la ligne s'ouvre derrière ceux qui sortent.`,
      OBJ('o2'), [
        rad('MISTRAL 3', 'MISTRAL', `URGENT. Assaut sur ma ligne, rue Royale. DEUX agents à terre devant les boucliers. Je demande un appui pour les dégager.`),
        rad('CENTAURE 1', 'MISTRAL', `Je peux avancer en protection jusqu'aux agents à terre et couvrir leur extraction, à votre ordre.`),
        rad('NEPTUNE 1', 'MISTRAL', `En batterie au débouché du boulevard Malesherbes. Jet diffus possible après vos sommations.`),
      ], [`Deux agents sont mis à terre devant la ligne`, `Un engin incendiaire touche un fourgon`, `Mortiers d'artifice à tir tendu`]),
    ph('releve-en-retard', `La relève qui n'arrive pas`,
      `Les deux agents sont dégagés et confiés aux secours. La section de la rue Royale tient depuis trop longtemps ; sa relève, annoncée, est en retard, bloquée derrière la place de la Madeleine. Une ligne fatiguée lance trop tôt, trop court, et frappe plus facilement : c'est maintenant que se produit le geste filmé.`,
      T(240), [
        rad('MISTRAL 2', 'MISTRAL', `Relève en retard : je suis bloqué derrière la Madeleine par la foule. Il me faut CINQ minutes de plus.`),
        rad('MISTRAL 3', 'MISTRAL', `Mes lanceurs tirent court, mes boucliers baissent. Je tiens encore, mais je ne garantis plus les gestes.`),
      ], [`Une relève est en retard`, `Panne radio de soixante secondes`, `Le vent tourne vers la ligne`]),
    ph('vingt-minutes', `Tenir vingt minutes`,
      `Devant la rue Royale, la foule revient par vagues plus courtes. Derrière vos lignes, la Concorde et l'Assemblée nationale ; devant, quatre vitrines de luxe déjà étoilées. Il reste à tenir jusqu'au bout, avec des sections relevées à temps, ou pas du tout.`,
      OBJ('o1'), [
        rad('ICARE', 'MISTRAL', `Le noyau se regroupe boulevard Malesherbes, UN-CINQ-ZÉRO individus. Nouvelle vague probable dans DEUX minutes.`),
        rad('MISTRAL 1', 'MISTRAL', `Vitrines attaquées côté place de la Madeleine. Je peux m'interposer, mais je dégarnis la place.`),
      ], [`Une nouvelle vague repart du boulevard Malesherbes`, `Des vitrines de luxe sont attaquées`]),
    ph('vendredi-soir', `Vendredi soir, avant le samedi`,
      `La rue Royale a tenu vingt minutes et les groupes refluent par le boulevard Malesherbes. Dans les fourgons, on compte les blessés et les grenades ; sur les téléphones, on annonce déjà les Champs-Élysées pour demain. La semaine n'est pas finie.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Quatrième jour terminé. Demain samedi : appel à converger vers les Champs-Élysées. Rendez compte : blessés, munitions, état des sections.`),
        rad('SANTÉ 1', 'MISTRAL', `Vos deux agents sont entre nos mains. Je vous transmets leur état dès que le médecin les a vus.`, 'T'),
      ]),
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
    `Deux sections au rond-point des Champs-Élysées, deux sur l'avenue Matignon, canon à eau en retrait. Centaure en réserve. Prononcez vous-même les sommations dans les formes, puis refoulez par bonds. Gardez la liaison avec les organisateurs jusqu'au bout.`,
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
    ph('samedi', `Samedi, les débouchés de l'avenue`,
      `Samedi, quatorze heures trente. L'avenue des Champs-Élysées est interdite à toute manifestation ; trois mille personnes y convergent quand même. Deux sections au Rond-Point des Champs-Élysées, deux avenue Matignon, le canon à eau en retrait, le Centaure en réserve : derrière vous, la place de la Concorde et, plus loin, l'Élysée.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Samedi, jour fort. Mission : INTERDIRE l'accès à la place de la Concorde. Renseignement : bloc de DEUX-ZÉRO-ZÉRO individus, véhicules visés.`, 'A'),
        rad('FAUCON 1', 'MISTRAL', `Trois équipages en attente avenue Gabriel. Disponibles pour les rues latérales.`),
      ], [`Les stations de l'avenue déversent des vagues continues`]),
    ph('descente', `La foule descend l'avenue`,
      `La foule descend l'avenue des Champs-Élysées depuis l'Étoile, dense, sur toute la largeur de la chaussée. À quatre cents mètres de vos lignes, le bloc se forme derrière ses parapluies ; une voiture en stationnement est retournée dans une rue latérale. Les organisateurs de mardi sont encore là, quelque part, au téléphone avec la liaison.`,
      TENS(0.65), [
        rad('ICARE', 'MISTRAL', `Tête de cortège à QUATRE-ZÉRO-ZÉRO mètres du Rond-Point. Bloc visible, DEUX-ZÉRO-ZÉRO individus. Une voiture retournée rue de Marignan.`),
        rad('LIAISON', 'MISTRAL', `Le porte-parole des Routiers est dans le cortège. Il peut encore détourner ses gens vers l'avenue Montaigne, si vous lui laissez l'issue.`),
      ], [`Un véhicule est retourné dans une rue latérale`, `Le bloc se forme derrière des parapluies`]),
    ph('sommations', `Les trois formules, au Rond-Point`,
      `La tension est à son comble. Le bloc attaque la ligne du Rond-Point des Champs-Élysées à tir tendu, et la foule suit à cinquante mètres. Vos chefs de section réclament la force ; elle ne vaudra rien si vous n'êtes pas d'abord sorti de votre véhicule, écharpe visible, à portée de mégaphone, pour dire les trois formules.`,
      OBJ('o2'), [
        rad('MISTRAL 2', 'MISTRAL', `Assaut sur ma ligne, mortiers à tir tendu. Je riposte d'initiative. Pour refouler, il me faut vos sommations.`),
        rad('ICARE', 'MISTRAL', `Voiture retournée en feu rue de Marignan. Barricade en construction au Rond-Point, côté avenue Montaigne.`),
      ], [`Un véhicule retourné est incendié`, `Mortiers d'artifice à tir tendu sur la ligne`, `Barricade enflammée au Rond-Point`]),
    ph('bonds', `Refouler par bonds vers l'Étoile`,
      `Les sommations sont dites. Refouler par bonds de cinquante mètres vers l'Étoile, en laissant l'avenue ouverte devant la foule ; éteindre les voitures avant qu'elles ne gagnent les façades ; ne pas lâcher l'avenue Matignon pendant que tout le monde regarde le Rond-Point.`,
      T(300), [
        rad('NEPTUNE 1', 'MISTRAL', `Prêt pour l'extinction des véhicules ou le jet diffus devant la ligne. Reste QUATRE MILLE litres.`),
        rad('MISTRAL 4', 'MISTRAL', `Avenue Matignon : un groupe de CINQ-ZÉRO contourne par chez moi vers la Concorde. Je tiens, sans réserve.`),
        rad('SAPEUR 1', 'MISTRAL', `Deux véhicules en feu signalés. Je m'engage rue de Marignan si elle est tenue.`),
      ], [`Un second véhicule est incendié`, `Un agent est mis à terre`, `Retour de gaz par vent tournant`]),
    ph('rumeur', `La rumeur de la charge`,
      `Une vidéo tourne : on y voit une charge, et le commentaire dit « sans sommation ». Elle a déjà dix mille vues. Sur l'avenue des Champs-Élysées, la foule recule par à-coups vers l'Étoile ; derrière elle, une ambulance cherche à passer.`,
      FOULE('dispersion'), [
        rad('CENTRAL', 'MISTRAL', `Vidéo virale : une charge présentée comme faite sans sommation. Votre journal horodaté est la seule réponse. Transmettez les heures.`),
        rad('SANTÉ 1', 'MISTRAL', `Ambulance bloquée à hauteur de l'avenue George V. Il me faut un couloir à travers le refoulement.`),
      ], [`Rumeur virale d'une charge sans sommation`, `Une ambulance demande le passage`]),
    ph('samedi-soir', `Samedi soir, l'avenue vide`,
      `L'avenue des Champs-Élysées se vide vers l'Étoile et les stations rouvrent une à une. Carcasses calcinées, bitume noirci, vitrines étoilées : la voirie attend votre feu vert. Il reste un acte, demain soir, et des sections qui n'ont plus rien en réserve.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Cinquième jour terminé. Demain soir : dernier rassemblement annoncé place de la Concorde. Rendez compte complet.`),
        rad('MISTRAL 2', 'MISTRAL', `Section regroupée au Rond-Point. Je vous transmets blessés, consommations et état de mes agents.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Interdire l\'accès à la place de la Concorde', 'tenir_position', { place: 'Place de la Concorde', seconds: 1500 }),
    ob('o2', 'Prononcer les sommations dans les formes avant la force', 'sommations_regulieres', { count: 3 }),
    os('o3', 'Éteindre les véhicules incendiés', 'eteindre', { target: 'vehicule', count: 2 }),
    os('o4', 'Garder l\'image publique au-dessus de quarante', 'personnalise', { target: 'image_publique', count: 40 }),
  ],
  failures: [fail('ligne_enfoncee', 'La Concorde est atteinte.'), fail('bavure_grave', 'Faute grave filmée : l\'enquête de l\'IGPN s\'ajoute à la semaine.')],
  randomEvents: ['Retour de gaz par vent tournant', 'Un agent est mis à terre', 'Une ambulance demande le passage', 'Rumeur virale d\'une charge sans sommation'],
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
    `La nuit joue contre vous : les coups ne se voient pas, les images circulent. Aucun emploi de la force sans sommations, hors riposte à des violences contre vos agents. Vos sections sont à bout : relevez-les avant qu'un geste de fatigue ne ruine la semaine.`,
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
    ph('dimanche', `Dimanche soir, sous la pluie`,
      `Dimanche, vingt heures trente, place de la Concorde. Sous la pluie, deux mille personnes s'installent autour de l'obélisque avec des bougies et des banderoles détrempées : beaucoup de visages de la semaine, fatigués eux aussi. Deux sections sur la place, une rue Royale, une cours la Reine ; vos agents en sont à leur sixième jour.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Dernier rassemblement de la semaine, non déclaré, place de la Concorde. Vos sections sont à bout : ménagez-les. Priorité à la désescalade.`, 'T'),
        rad('LIAISON', 'MISTRAL', `Le porte-parole des Routiers est là. Il veut annoncer lui-même la fin de la mobilisation à DEUX-DEUX heures, si la soirée reste calme.`),
      ], [`Un agent s'effondre d'épuisement dans une section`]),
    ph('embrasement', `Ceux qui veulent l'embrasement`,
      `Quatre-vingts personnes quittent le rassemblement et remontent vers la rue Royale, capuches trempées. Elles n'ont rien à annoncer et rien à négocier : elles cherchent l'image qui relancerait tout. Le reste de la place de la Concorde les regarde partir, sans les suivre, pour l'instant.`,
      TENS(0.72), [
        rad('ICARE', 'MISTRAL', `Groupe de HUIT-ZÉRO en mouvement vers la rue Royale, visages couverts. Le reste de la place ne suit pas.`),
        rad('MISTRAL 3', 'MISTRAL', `Je les vois arriver sur mon barrage de la rue Royale. Mes agents sont à cran. Consigne ?`),
      ], [`Un groupe cherche l'affrontement rue Royale`, `Un enfant est perdu dans la foule`]),
    ph('trois-feux', `Trois feux sous la pluie`,
      `La tension monte malgré la pluie. Une barricade brûle sur le cours la Reine, un fourgon est touché par un engin incendiaire rue Royale, des poubelles flambent au pied d'un candélabre de la place. Trois feux, trois moyens possibles : l'extincteur d'une section, le canon à eau, les pompiers sous escorte.`,
      OBJ('o3'), [
        rad('MISTRAL 4', 'MISTRAL', `Feu de barricade sur le cours la Reine, flammes hautes. Trop gros pour mon extincteur.`),
        rad('MISTRAL 3', 'MISTRAL', `Un fourgon touché par un engin incendiaire, rue Royale. Équipage sorti. Je demande l'extinction.`),
        rad('NEPTUNE 1', 'MISTRAL', `Disponible pour l'extinction. Dites-moi lequel d'abord.`),
      ], [`Un feu de barricade est allumé sur le cours la Reine`, `Un fourgon est incendié rue Royale`, `Des poubelles brûlent sur la place`]),
    ph('derniere-releve', `Relever avant le geste de trop`,
      `Les trois feux sont traités. Rue Royale, la section qui tient depuis le début de la soirée n'en peut plus ; un journaliste demande à sortir du dispositif, et le porte-parole attend toujours son micro. C'est l'heure où une semaine entière peut se perdre sur un coup de bâton filmé dans le noir.`,
      FOULE('dispersion'), [
        rad('MISTRAL 3', 'MISTRAL', `Je demande la relève immédiate de ma section. Un de mes agents vient de lever son bâton sans ordre. Je l'ai retenu.`),
        rad('LIAISON', 'MISTRAL', `Le porte-parole est prêt à annoncer la fin au mégaphone. Il lui faut CINQ minutes de calme sur la place.`),
        voix('JOURNALISTE', `Je veux sortir par la rue de Rivoli, on me dit que c'est fermé. Vous retenez la presse, maintenant ?`),
      ], [`Un journaliste réclame la sortie`, `Panne radio de soixante secondes`, `Un agent lève son bâton sans ordre`]),
    ph('bilan', `Le bilan de la semaine`,
      `La pluie et la fatigue vident la place de la Concorde. Les bougies ne brûlent plus, les banderoles sont roulées ; six jours tiennent désormais dans un compte rendu : blessés des deux côtés, munitions, interpellations, image publique, et ce que la rue retiendra de vos sections.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin du dernier acte. Compte rendu de la semaine attendu : il sera relu ligne à ligne.`),
        rad('LIAISON', 'MISTRAL', `Le porte-parole vous fait dire que, pour lui, c'est terminé. Il ne peut pas parler pour les autres.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Protéger la place de la Concorde jusqu\'à la fin de la mission', 'proteger_site', { place: 'Place de la Concorde' }),
    ob('o2', 'Terminer la semaine sans faute grave', 'zero_bavure'),
    ob('o3', 'Traiter les trois feux de la place', 'traiter_incidents', { target: 'feu', count: 3 }),
    os('o4', 'Garder une image publique supérieure à quarante', 'personnalise', { target: 'image_publique', count: 40 }),
  ],
  failures: [fail('ligne_enfoncee', 'La Concorde est envahie.'), fail('bavure_grave', 'Faute grave en fin de semaine : sanction exemplaire.')],
  randomEvents: ['Panne radio de soixante secondes', 'Un agent s\'effondre d\'épuisement', 'Un journaliste réclame la sortie', 'Un enfant perdu dans la foule'],
  unique: 'Le bilan de la semaine s\'écrit sur une seule soirée, avec la fatigue de tous les actes précédents.',
  difficulty: 5, chapter: 8, tags: ['semaine', 'acte-6', 'campagne'],
});

/** Les six actes de la campagne, dans l'ordre. */
export const SEMAINE: MissionDef[] = [SEMAINE_1, SEMAINE_2, SEMAINE_3, SEMAINE_4, SEMAINE_5, SEMAINE_6];
