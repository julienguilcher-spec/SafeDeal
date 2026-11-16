/* =====================================================================================
 * Catalogue — commandant (commandement et autorité habilitée réunis, voir BRIEF §1).
 * Les anciennes missions du « commissaire » sont ici : le commandant tient l'écharpe,
 * le mégaphone et les sommations. Ses ordres s'appliquent immédiatement.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { SEMAINE } from './semaine';

const CDT: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'commandant', poste: 'commandant_unite' };
const ADJ: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'capitaine', poste: 'commandant_unite' };

/** Première prise de commandement : cortège déclaré, ambiance calme (miroirs : journaliste, manifestant pacifique). */
export const CDT_01 = mission({
  ...ADJ,
  id: 'cdt-01-prise-de-commandement',
  title: 'Prise de commandement',
  pitch: 'Votre première demi-compagnie, un cortège déclaré de neuf cents personnes et un camion sonorisé capricieux : le métier commence par savoir se faire oublier.',
  briefing: [
    `Une intersyndicale, le « Front commun des Ateliers », défile contre le « projet Horizon », une réforme des horaires de travail. Parcours déclaré en préfecture : place de la République, boulevard du Temple, boulevard des Filles du Calvaire, boulevard Beaumarchais, place de la Bastille, soit 1,5 km. Neuf cents marcheurs sont attendus, familles et retraités compris, avec un service d'ordre de bonne volonté. Aucun renseignement ne signale de groupe violent.`,
    `Vous commandez la demi-compagnie : deux sections, six fourgons. Votre mission est d'accompagner le cortège jusqu'à la Bastille sans incident, de garder libres les axes perpendiculaires et de ne pas peser sur l'ambiance. Vous portez l'écharpe tricolore et tenez le mégaphone : vous êtes seul décideur, ce qui vous rend aussi seul responsable de chaque ordre.`,
    `La section 1 précède discrètement le cortège à cent mètres, la section 2 reste en réserve dans les rues parallèles, les fourgons alignés rue Amelot. Vous jalonnez chaque carrefour sans montrer vos boucliers : casques à la ceinture, rien en ligne tant que rien ne l'exige. Si le camion sonorisé tombe en panne, vous ouvrez un parcours de délestage plutôt que de laisser s'allonger l'attente. À la Bastille, vous laissez la dispersion se faire par la rue Saint-Antoine.`,
    `Le renseignement ne vous demande pas de faire un exploit : il vous demande de ne rien provoquer. Toute unité visible du cortège hors de la tête compte contre vous. Rendez compte à la salle toutes les cinq minutes. Un agent blessé ou un geste de trop pèsera plus lourd que toute la réussite du reste.`,
  ],
  ...{ type: 'manifestation_declaree' as const, place: 'Place de la République', timeOfDay: 14, weather: 'clair' as const, windFrom: 270, windSpeed: 4 },
  crowd: crowd(900, 'pouvoir_achat', 0.1, 0.2, 0.01, { syndical: 0.55, familles: 0.15, retraites: 0.1, etudiants: 0.1, gilets_jaunes: 0.1 },
    ['Place de la République', 'Boulevard du Temple', 'Boulevard des Filles du Calvaire', 'Boulevard Beaumarchais', 'Place de la Bastille'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Neuf cents personnes, ambiance de marche calme, camion sono en tête, service d\'ordre syndical identifié.',
    'Aucun signalement de groupe radical ; une poignée d\'opportunistes possibles à l\'arrivée.',
    ['Boulevard du Temple', 'Place de la Bastille', 'Rue Saint-Antoine'],
    ['Placer la réserve dans les rues parallèles, hors de vue', 'Prévoir un délestage par la rue de Turbigo', 'Rouvrir les stations de métro dès la dispersion']),
  phases: [
    ph('mise-en-place', `Le dispositif avant la foule`,
      `Place de la République, une heure avant le départ. Les bouches du métro déversent les premiers marcheurs du « Front commun des Ateliers » autour de la statue ; vos deux sections gagnent leurs rues parallèles et les fourgons s'alignent rue Amelot, hors de vue.`,
      FOULE('depart'), [
        rad('CENTRAL', 'MISTRAL', `Cortège déclaré, parcours République, Bastille. Vous accompagnez, vous ne précédez pas. Compte rendu toutes les CINQ minutes.`, 'A'),
        rad('MISTRAL 2', 'MISTRAL', `Section en réserve, en retard de TROIS minutes : un car de tourisme est en travers de la rue Amelot. Je termine à pied.`),
        voix('ORGANISATEUR', `Commandant ? On est le service d'ordre. On voudrait partir avec un quart d'heure de retard, le temps que les cars de province arrivent.`),
      ], [`Une section est en retard sur sa mise en place`, `Les organisateurs demandent un quart d'heure de plus`]),
    ph('jalonnement', `Jalonner sans se montrer`,
      `La banderole de tête s'ébranle vers le boulevard du Temple et le camion sono lance les chants. La section 1 précède à cent mètres, casques à la ceinture ; à chaque carrefour, il faut qu'un groupe soit passé avant le cortège, sans jamais se montrer en ligne.`,
      T(240), [
        rad('MISTRAL 1', 'MISTRAL', `Tête de cortège à DEUX-ZÉRO-ZÉRO mètres derrière moi. Nature : cortège déclaré. Volume : NEUF-ZÉRO-ZÉRO. Attitude : calme, service d'ordre présent.`),
        rad('CENTRAL', 'MISTRAL', `Les stations Filles du Calvaire et Chemin Vert peuvent être fermées le temps du passage, sur votre demande.`, 'T'),
      ], [`Un touriste traverse le cortège avec une valise`]),
    ph('panne-sono', `Le camion sono ne repart plus`,
      `À l'entrée du boulevard des Filles du Calvaire, le camion sono cale et ne redémarre pas. Derrière lui, neuf cents personnes s'entassent sur la chaussée ; les chants s'arrêtent, les rangs se resserrent, et les organisateurs cherchent votre écharpe des yeux.`,
      OBJ('o2'), [
        rad('LIAISON', 'MISTRAL', `Le camion sono est en panne à l'entrée du boulevard des Filles du Calvaire. Les organisateurs demandent un délestage pour faire passer le cortège à côté.`),
        rad('MISTRAL 1', 'MISTRAL', `Le cortège s'accumule derrière le camion, densité en hausse. Je n'ai aucune consigne pour le contourner.`),
        voix('ORGANISATEUR', `Si on reste plantés là dix minutes, je ne tiens plus mes jeunes. Ouvrez-nous une rue, n'importe laquelle !`),
      ], [`Le camion sono tombe en panne au milieu du boulevard`, `Averse de deux minutes`]),
    ph('reprise', `Six cents mètres jusqu'à la colonne`,
      `Le délestage est ouvert et le cortège contourne le camion immobilisé pour retrouver le boulevard Beaumarchais. La colonne de Juillet est en vue ; restent six cents mètres de marche, deux carrefours à jalonner et la place de la Bastille à préparer pour l'arrivée.`,
      FOULE('dispersion'), [
        rad('LIAISON', 'MISTRAL', `Les organisateurs vous remercient pour le délestage. Ils annoncent la dispersion à l'arrivée, sortie par la rue Saint-Antoine.`),
        rad('MISTRAL 2', 'MISTRAL', `Malaise d'un retraité à hauteur de la rue Amelot, conscient. Je demande SANTÉ UN, je garde le passage.`),
      ], [`Malaise d'un retraité dans le cortège`, `Rumeur en ligne sur un affrontement qui n'a pas eu lieu`]),
    ph('dislocation', `Dislocation à la Bastille`,
      `La tête de cortège atteint la place de la Bastille et les organisateurs annoncent la fin au micro. La foule se disloque vers la rue Saint-Antoine et les bouches du métro ; il reste à faire rouvrir les stations, à lever les fermetures de rues et à rendre compte.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Les stations rouvrent sur votre demande. Confirmez la fin de mission quand la chaussée est rendue à la circulation.`),
        rad('MISTRAL 1', 'MISTRAL', `Tête de cortège arrivée place de la Bastille. Dislocation en cours, j'attends vos ordres pour la suite.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Accompagner le cortège jusqu\'à la place de la Bastille sans emploi de la force', 'escorter', { place: 'Place de la Bastille' }),
    ob('o2', 'Ouvrir le parcours de délestage dès la panne du camion sonorisé', 'traiter_incidents', { target: 'panne_sono', count: 1 }),
    os('o3', 'Rendre compte à la salle toutes les cinq minutes', 'personnalise', { target: 'compte_rendu_radio', count: 5 }),
    os('o4', 'Ne déplorer aucun agent blessé', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Emploi de la force sur un cortège pacifique : enquête de l\'IGPN.'), fail('revocation', 'Ordre manifestement illégal donné : retrait du commandement.')],
  randomEvents: ['Un touriste traverse le cortège avec une valise', 'Averse de deux minutes', 'Malaise d\'un retraité à hauteur de la rue Amelot', 'Rumeur en ligne sur un affrontement imaginaire'],
  unique: 'Aucune violence au programme : l\'essentiel du commandement consiste à rester invisible et à ne rien déclencher.',
  difficulty: 2, chapter: 5, altRoles: ['journaliste', 'manifestant'], tags: ['miroir', 'debutant', 'declaree'],
});

/** Précortège de tête violent, journée nationale tendue (miroirs : journaliste, manifestant radical, télépilote). */
export const CDT_02 = mission({
  ...CDT,
  id: 'cdt-02-le-precortege',
  title: 'Le précortège',
  pitch: 'Trois cents personnes cagoulées devant huit mille marcheurs : séparer les uns des autres sans gazer les autres.',
  briefing: [
    `Journée nationale d'action du « Front commun des Ateliers » contre le « projet Horizon ». Huit mille marcheurs sont déclarés place de la République, avec boulevard du Temple pour axe. Le renseignement signale un précortège d'environ trois cents personnes, dont une centaine déterminée, qui se forme en avant de la banderole officielle. Des fumigènes noirs et des parapluies ont déjà été repérés par une patrouille en civil.`,
    `Vous commandez la compagnie complète : quatre sections, douze fourgons, un drone. Votre mission est de séparer le précortège du cortège déclaré, d'empêcher le saccage du boulevard et de garder ouverte la voie de sortie du gros de la manifestation. Vous êtes l'autorité qui qualifie, somme et ordonne : aucun gaz ne doit atteindre les familles.`,
    `Deux sections face au précortège sur le boulevard du Temple, une section en réserve rue du Temple, une section sur le flanc par la rue de Turbigo. Le drone suit les changements de tenue et les regroupements. Dès qu'un bloc se forme, repérez-le et choisissez : canalisation, interpellation différée, ou sommations puis refoulement vers l'est. Pesez chaque ordre : la tête de cortège regarde votre ligne.`,
    `Les familles sont dans le cortège principal, à moins de cent mètres de la zone d'affrontement probable. Tout tir de grenade qui aboutit sur elles est une faute lourde. La liaison avec les organisateurs est ouverte : utilisez-la avant la force.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard du Temple', timeOfDay: 15, weather: 'couvert', windFrom: 250, windSpeed: 4,
  crowd: crowd(1200, 'pouvoir_achat', 0.35, 0.6, 0.12, { syndical: 0.4, familles: 0.1, black_bloc: 0.1, etudiants: 0.15, gilets_jaunes: 0.15, retraites: 0.1 },
    ['Place de la République', 'Boulevard du Temple', 'Boulevard des Filles du Calvaire', 'Boulevard Beaumarchais', 'Place de la Bastille'], 0.5),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Environ huit mille personnes déclarées ; un précortège de trois cents personnes en tête.',
    'Une centaine d\'individus déterminés, noir intégral, parapluies et banderole renforcée.',
    ['Boulevard du Temple', 'Rue de Turbigo', 'Rue du Temple'],
    ['Retirer poubelles et barrières du boulevard avant l\'arrivée', 'Faire parler la liaison au service d\'ordre', 'Demander le drone sur la tête de cortège']),
  phases: [
    ph('signaux', `Les signes avant le premier jet`,
      `Place de la République, le cortège se forme derrière sa banderole. Trois cents personnes s'en détachent déjà et remontent vers le boulevard du Temple ; à hauteur d'un kiosque, des sacs s'ouvrent, des vestes noires sortent, des parapluies se déploient au-dessus d'un groupe qui se change.`,
      FOULE('depart'), [
        rad('ICARE', 'MISTRAL', `Fumigène noir, parapluies ouverts, changements de tenue : un bloc se forme à hauteur du kiosque, côté boulevard du Temple. SIX-ZÉRO personnes pour l'instant.`),
        rad('CENTRAL', 'MISTRAL', `Renseignement confirmé : précortège de TROIS-ZÉRO-ZÉRO, dont UN-ZÉRO-ZÉRO déterminés. Vous qualifiez, vous décidez.`, 'T'),
        rad('LIAISON', 'MISTRAL', `Le service d'ordre a vu le groupe. Il ne peut pas le retenir, mais il peut ralentir sa banderole si vous le demandez.`),
      ], [`Un groupe se change sous des parapluies`, `Un fumigène noir enflamme un banc`]),
    ph('decision', `Isoler le bloc, ou le suivre`,
      `Le précortège s'engage sur le boulevard du Temple sans attendre le camion sono, banderole renforcée en tête. Cent mètres derrière, les familles du cortège déclaré ; devant, vos deux sections. Entre les deux, l'espace où tout se décidera : canaliser, interpeller plus tard, ou sommer et refouler vers l'est.`,
      TENS(0.5), [
        rad('MISTRAL 2', 'MISTRAL', `Chaussée dépavée à l'angle du boulevard du Temple, barrières de chantier tirées en travers. Ils préparent quelque chose.`),
        rad('ICARE', 'MISTRAL', `Le bloc est formé : UN-ZÉRO-ZÉRO personnes en noir derrière une banderole renforcée, à UN-CINQ-ZÉRO mètres de votre ligne. Le cortège déclaré suit à CENT mètres.`),
      ], [`Des pavés sont descellés à l'angle du boulevard`, `Des barrières de chantier sont tirées en travers de la chaussée`]),
    ph('banques', `Deux banques au marteau`,
      `La tension vient de monter d'un cran. Sur le boulevard du Temple, le bloc s'en prend à deux agences bancaires : vitrines au marteau, distributeur arraché, premières bouteilles sur vos boucliers. Le gros du cortège ralentit, inquiet ; une poussette fait demi-tour.`,
      T(240), [
        rad('MISTRAL 1', 'MISTRAL', `Jets de bouteilles sur ma ligne, dégradations en cours sur deux banques. UN engin incendiaire sur un fourgon. J'attends vos ordres.`),
        rad('ICARE', 'MISTRAL', `Trois auteurs filmés au marteau devant la première banque. Je peux les suivre si vous préférez les interpeller plus tard.`),
      ], [`Deux agences bancaires sont attaquées au marteau`, `Un engin incendiaire est lancé sur un fourgon`, `Une poussette est prise dans la bousculade`]),
    ph('separation', `Cent mètres entre le bloc et les familles`,
      `Tout l'enjeu tient dans cent mètres de boulevard du Temple : séparer le bloc du cortège déclaré sans qu'un seul nuage atteigne les familles. Le vent pousse vers l'est, le long du boulevard ; la liaison peut faire ralentir la banderole officielle, et la section de la rue de Turbigo attend sur le flanc.`,
      OBJ('o1'), [
        rad('LIAISON', 'MISTRAL', `Les organisateurs acceptent de retenir leur banderole CINQ-ZÉRO mètres en arrière, si vous le leur demandez maintenant.`),
        rad('MISTRAL 4', 'MISTRAL', `En place rue de Turbigo, sur le flanc du précortège. Prêt à couper entre le bloc et le cortège, à votre ordre.`),
      ], [`Mortiers d'artifice tirés à tir tendu vers les agents`, `Le vent tourne et rabat les fumées vers le cortège déclaré`]),
    ph('voie-de-sortie', `La voie de sortie du cortège`,
      `Le bloc est coupé du cortège déclaré. Derrière vos lignes, les marcheurs attendent de repartir : leur camion sono est arrêté par les restes d'une barricade, et la voie de sortie par le boulevard des Filles du Calvaire doit rester libre jusqu'au dernier d'entre eux.`,
      FOULE('dispersion'), [
        rad('LIAISON', 'MISTRAL', `Le camion sono est bloqué par une barricade. Les organisateurs demandent qu'on la dégage, ou qu'on leur ouvre un délestage.`),
        rad('MISTRAL 3', 'MISTRAL', `Des éléments du bloc se changent dans les rues latérales et cherchent à rentrer dans le cortège.`),
      ], [`Le camion sono est bloqué par une barricade`, `Des radicaux se changent et se fondent dans le cortège`]),
    ph('bastille', `Ce qui reste sur le boulevard`,
      `Le cortège déclaré se disloque place de la Bastille, au bout du boulevard Beaumarchais. Sur le boulevard du Temple, il reste des pavés descellés, deux vitrines de banque à faire garder et un compte rendu à dresser : munitions, blessés des deux côtés, interpellations.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Dislocation en cours place de la Bastille. Rendez compte : consommations, blessés, interpellations, vitrines.`),
        rad('MISTRAL 2', 'MISTRAL', `Je garde les deux banques en attendant leurs responsables. Pavés descellés à signaler à la voirie.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Séparer le précortège du cortège déclaré sans gaz sur ce dernier', 'disperser', { place: 'Boulevard du Temple' }),
    ob('o2', 'Garder libre la voie de sortie du cortège pendant toute l\'action', 'tenir_position', { place: 'Boulevard des Filles du Calvaire', seconds: 900 }),
    os('o3', 'Repérer au moins trois signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 3 }),
    os('o4', 'Limiter les vitrines brisées à cinq', 'limiter_degats', { max: 5 }),
  ],
  failures: [fail('bavure_grave', 'Gaz ou charge sur le cortège déclaré : faute lourde.'), fail('ligne_enfoncee', 'La ligne est percée et le boulevard est saccagé.'), fail('trop_de_blesses', 'Trop de blessés dans le cortège.', 20)],
  randomEvents: ['Vent tournant qui renvoie le gaz', 'Poussette prise dans la bousculade', 'Deux journalistes se plaquent contre un mur', 'Camion sono bloqué par une barricade'],
  unique: 'Isoler l\'avant-garde violente d\'un grand cortège pacifique, avec la liaison et le drone comme voies sans force.',
  difficulty: 4, chapter: 6, altRoles: ['journaliste', 'manifestant', 'telepilote'], tags: ['miroir', 'precortege', 'tendue'],
});

/** Manifestation interdite à l'Étoile : douze barrages radiaux. */
export const CDT_03 = mission({
  ...CDT,
  id: 'cdt-03-etoile-a-douze-branches',
  title: 'L\'Étoile à douze branches',
  pitch: 'Douze avenues convergent vers l\'Arc de Triomphe et un appel non déclaré à s\'y retrouver : tenir un cercle que l\'on ne peut pas fermer.',
  briefing: [
    `Un appel anonyme, sans organisateur, invite à converger vers la place Charles-de-Gaulle. Le préfet a interdit tout rassemblement dans le périmètre de l'Étoile. Le renseignement estime qu'un millier de personnes arriveront par les avenues Foch, de la Grande-Armée, des Champs-Élysées et Kléber, dont quelques centaines de personnes décidées à atteindre l'Arc de Triomphe.`,
    `Vous commandez toutes les sections disponibles : quatre sections, un Centaure, un canon à eau, un drone. Votre mission est d'interdire l'accès à la place sans jamais laisser un barrage isolé, de protéger l'Arc de Triomphe et le Soldat inconnu, et de garder libre un couloir de secours vers l'avenue Hoche.`,
    `Une section à l'est vers les Champs-Élysées, une à l'ouest avenue de la Grande-Armée, une au nord avenue de Wagram, une en réserve mobile. Le Centaure et le canon à eau au sud, prêts à ouvrir un barrage. Vous constatez, vous annoncez, vous sommez : avant toute force, prononcez les sommations de votre voix depuis le mégaphone. Le drone vous dit où la foule est la plus dense.`,
    `Le rond-point ne s'enferme pas : douze issues, donc douze fuites pour la foule. N'enfermez personne. Un tir de grenade lacrymogène dans l'une des avenues peut pousser la foule vers les autres : pensez à la suite avant de donner l'ordre.`,
  ],
  type: 'manifestation_interdite', place: 'Place Charles de Gaulle', timeOfDay: 15.5, weather: 'nuageux', windFrom: 290, windSpeed: 5,
  crowd: crowd(1500, 'libertes', 0.4, 0.65, 0.1, { gilets_jaunes: 0.45, militants: 0.15, black_bloc: 0.1, familles: 0.1, curieux: 0.2 },
    ['Avenue des Champs-Élysées', 'Avenue de la Grande Armée', 'Avenue Foch', 'Avenue Kléber', 'Place Charles de Gaulle'], 0.6),
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, canonEau: 1, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Un millier de personnes sans organisateur, ambiance « acte non déclaré », foule dispersée sur douze avenues.',
    'Quelques centaines de personnes décidées, sans coordination claire ; un bloc possible avenue de la Grande-Armée.',
    ['Avenue de la Grande Armée', 'Avenue des Champs-Élysées', 'Avenue Foch'],
    ['Fermer la circulation des douze avenues avant 14 h', 'Garder un couloir de secours avenue Hoche', 'Placer la réserve au centre de l\'anneau']),
  phases: [
    ph('douze-debouches', `Douze avenues, quatre sections`,
      `Place Charles de Gaulle, sous l'Arc de Triomphe. Douze avenues débouchent sur le rond-point et vous n'avez que quatre sections : une vers les Champs-Élysées, une avenue de la Grande Armée, une avenue de Wagram, une en réserve mobile. Le Centaure et le canon à eau attendent côté avenue Kléber.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Mission : INTERDIRE la place Charles-de-Gaulle. Cadre : rassemblement interdit par arrêté. Vous disposez de CENTAURE UN et de NEPTUNE UN.`, 'A'),
        rad('MISTRAL 3', 'MISTRAL', `En place avenue de Wagram, face nord. Un car de touristes est arrêté avenue de Friedland, ses passagers sont à pied sous l'Arc.`),
      ], [`Un car de touristes bloque l'avenue de Friedland`, `Des touristes sont restés sous l'Arc de Triomphe`]),
    ph('vagues-du-metro', `Les vagues du métro`,
      `Les premières vagues sortent des stations Charles de Gaulle – Étoile et Argentine, gilets jaunes sur le dos, et remontent les avenues vers vos barrages. Elles testent, reculent, cherchent l'avenue la moins gardée ; fermer une station tarit un flux et en grossit un autre.`,
      TENS(0.55), [
        rad('ICARE', 'MISTRAL', `Groupe de TROIS-ZÉRO-ZÉRO sur l'avenue de la Grande Armée, visages couverts en tête. Flux continu à la sortie de la station Argentine.`),
        rad('CENTRAL', 'MISTRAL', `Les stations Étoile, Argentine et Kléber peuvent être fermées sur votre demande. Délai : DEUX minutes par station.`),
      ], [`Arrivées par vagues aux bouches du métro`]),
    ph('pressions', `Kléber, Wagram, Grande Armée en même temps`,
      `Trois avenues poussent à la fois. Avenue de la Grande Armée, des bouteilles ; avenue de Wagram, vingt personnes débordent le barrage par le trottoir ; avenue Kléber, une barricade de barrières et de trottinettes monte en travers de la chaussée. Avant toute force, il vous faut être à portée de mégaphone, écharpe visible, et dire les trois formules.`,
      OBJ('o3'), [
        rad('MISTRAL 3', 'MISTRAL', `Barrage nord débordé par DEUX-ZÉRO personnes sur le trottoir. Je demande la réserve.`),
        rad('MISTRAL 2', 'MISTRAL', `Jets de bouteilles sur le barrage ouest, avenue de la Grande Armée. Attroupement de TROIS-ZÉRO-ZÉRO, refus de reculer. Vos sommations ?`),
        rad('ICARE', 'MISTRAL', `Barricade en construction avenue Kléber : barrières, trottinettes, un conteneur. Pas encore de feu.`),
      ], [`Jets de bouteilles sur le barrage ouest`, `Une barricade est montée avenue Kléber`, `Le barrage nord est débordé par le trottoir`]),
    ph('bascule', `La bascule de l'effort`,
      `Les sommations sont prononcées : la force est désormais la vôtre à employer, ou non. La barricade de l'avenue Kléber vient de s'embraser ; le canon à eau peut l'éteindre, le Centaure la pousser, la réserve ne peut être qu'à un endroit à la fois. Chaque nuage lâché dans une avenue pousse la foule vers les onze autres.`,
      T(240), [
        rad('NEPTUNE 1', 'MISTRAL', `En attente avenue Kléber, QUATRE MILLE litres. Prêt pour l'extinction de la barricade ou le jet diffus, à votre ordre.`),
        rad('CENTAURE 1', 'MISTRAL', `Obstacle en feu à CINQ-ZÉRO mètres. Je ne pousse pas tant qu'il brûle et tant que je n'ai pas vérifié qu'il n'y a personne derrière.`),
        rad('MISTRAL 1', 'MISTRAL', `Côté Champs-Élysées, la foule grossit devant moi : ceux que vous repoussez à l'ouest arrivent chez moi.`),
      ], [`La barricade de l'avenue Kléber s'embrase`, `Panne radio de soixante secondes`]),
    ph('arc', `Quarante mètres avant la Flamme`,
      `Une centaine de personnes profite de la bascule pour courir vers l'Arc de Triomphe par l'avenue Foch. La tombe du Soldat inconnu est à quarante mètres d'elles ; les touristes du car, eux, sont toujours sous la voûte. Avenue Hoche, le couloir des secours tient encore.`,
      FOULE('dispersion'), [
        rad('MISTRAL 4', 'MISTRAL', `UN-ZÉRO-ZÉRO individus courent vers l'Arc par l'avenue Foch. Je peux m'interposer devant le monument, mais je découvre l'avenue Hoche.`),
        rad('SANTÉ 1', 'MISTRAL', `Deux blessés à prendre en charge avenue de la Grande Armée. Je passe par l'avenue Hoche si elle est libre.`),
      ], [`Un groupe court vers l'Arc de Triomphe`, `Ordre contradictoire de la salle`]),
    ph('reouverture', `Rendre la place, avenue après avenue`,
      `La pression retombe avec la tombée du jour : la foule reflue par les avenues vers le métro et les Champs-Élysées. Reste à rendre la place Charles de Gaulle, avenue après avenue, sans dégarnir l'Arc trop tôt, et à faire constater les dégâts.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Rouvrez les avenues une à une, en commençant par celles où il n'y a plus personne. Compte rendu d'opération attendu.`),
        rad('MISTRAL 2', 'MISTRAL', `Avenue de la Grande Armée : plus de foule constituée, des groupes épars. Je peux lever le barrage à votre ordre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Interdire l\'accès à la place Charles-de-Gaulle', 'proteger_site', { place: 'Place Charles de Gaulle', target: 'arc_de_triomphe' }),
    ob('o2', 'Ne laisser aucun barrage isolé plus de quinze secondes', 'tenir_position', { seconds: 900 }),
    ob('o3', 'Prononcer les trois sommations avant tout emploi de la force', 'sommations_regulieres', { count: 3 }),
    os('o4', 'Garder libre le couloir de secours avenue Hoche', 'proteger_site', { place: 'Avenue Hoche' }),
  ],
  failures: [fail('site_envahi', 'L\'Arc de Triomphe est envahi.'), fail('bavure_grave', 'Emploi de la force sans sommation.'), fail('ligne_enfoncee', 'Un barrage est percé et ne se reforme pas.')],
  randomEvents: ['Touristes pris entre deux barrages', 'Bloc noir avenue de la Grande-Armée', 'Panne radio de soixante secondes', 'Ordre contradictoire de la salle'],
  unique: 'Douze barrages radiaux autour d\'un monument, où l\'on ne peut ni tout fermer ni tout surveiller.',
  difficulty: 5, chapter: 6, tags: ['interdite', 'monument', 'etoile'],
});

/** Émeute nocturne et pillages dans le quartier du Palais-Royal. */
export const CDT_04 = mission({
  ...ADJ,
  id: 'cdt-04-nuit-des-vitrines',
  title: 'Nuit des vitrines',
  pitch: 'La nuit tombe sur le quartier du Palais-Royal : une cinquantaine de pilleurs, des vitrines qui sautent, et vos deux sections trop peu nombreuses pour tout garder.',
  briefing: [
    `Après une journée de mobilisation, une partie des manifestants ne se disperse pas. Au crépuscule, des groupes mobiles remontent la rue de Rivoli, la rue Saint-Honoré et la place Vendôme. Les premières vitrines sont brisées. Les commerçants appellent le 17.`,
    `Vous commandez la demi-compagnie : deux sections, un BRAV-M de renfort, un drone. Votre mission est de contenir les dégâts, de protéger les boutiques les plus exposées et d'interpeller les auteurs sur faits constatés, sans faire basculer le quartier dans la violence. Les pompiers et le SAMU sont à distance, à demander par radio.`,
    `Section 1 fixe sur la place Vendôme et la rue de la Paix, section 2 mobile sur la rue Saint-Honoré. Le drone désigne les groupes, les BRAV-M interviennent sur ordre. Chaque feu, chaque blessé devient un incident que vous pouvez déléguer. Gardez les secours dans un couloir protégé.`,
    `À la nuit, la lumière joue contre vous : le renseignement est moins fiable. N'engagez pas un groupe plus nombreux que le vôtre dans une rue étroite. Ne laissez pas un agent isolé à moins de cent mètres d'un pillage.`,
  ],
  type: 'emeute_nocturne', place: 'Rue Saint-Honoré', timeOfDay: 21.5, weather: 'couvert', windFrom: 240, windSpeed: 3,
  crowd: crowd(500, '', 0.55, 0.75, 0.2, { black_bloc: 0.25, curieux: 0.25, fetards: 0.2, militants: 0.1, gilets_jaunes: 0.2 },
    ['Rue de Rivoli', 'Rue Saint-Honoré', 'Place Vendôme', 'Rue de la Paix', 'Place de l\'Opéra'], 0.15),
  forces: forces({ sections: 2, fourgons: 6, bravm: 3, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Cinq cents personnes dispersées en groupes mobiles ; une cinquantaine de pilleurs possibles.',
    'Une quarantaine d\'individus encagoulés ; le reste suit par curiosité.',
    ['Place Vendôme', 'Rue de la Paix', 'Rue Saint-Honoré'],
    ['Protéger d\'abord les bijouteries de la place Vendôme', 'Demander les pompiers avant le premier feu de façade', 'Garder les BRAV-M en réserve mobile']),
  phases: [
    ph('appels', `Huit appels en trois minutes`,
      `Vingt et une heures trente. Depuis votre véhicule de commandement, garé près de la place Vendôme, la carte se couvre de signalements : vitrines rue de Rivoli, rideau forcé rue Saint-Honoré, groupe masqué rue de Castiglione. Huit appels en trois minutes, deux sections, trois équipages à moto ; tout ne sera pas vrai, et tout ne pourra pas être traité.`,
      T(180), [
        rad('CENTRAL', 'MISTRAL', `Groupe de UN-CINQ individus, vitrines brisées, rue Saint-Honoré. Autre appel : rideau de fer forcé rue de Rivoli. Autre appel : feu de poubelles rue de Castiglione.`),
        rad('FAUCON 1', 'MISTRAL', `Trois équipages en attente place Vendôme. Prêts à intervenir sur objectif désigné.`),
        rad('ICARE', 'MISTRAL', `Je n'ai rien rue de Castiglione : ni feu ni groupe. Appel à vérifier.`),
      ], [`Un appel se révèle faux`, `Un rideau de fer est forcé à la barre`]),
    ph('pillage', `Frapper et repartir, rue de la Paix`,
      `Rue de la Paix, une bijouterie et deux boutiques sont attaquées en même temps par des groupes de dix à vingt qui frappent et repartent. La section 1 est fixe place Vendôme, la section 2 mobile rue Saint-Honoré ; les motos n'interviennent que sur un objectif que le drone a vu faire.`,
      T(240), [
        rad('MISTRAL 1', 'MISTRAL', `Pillage en cours rue de la Paix, UN-CINQ individus dans une bijouterie. Je suis à CENT mètres, à vos ordres.`),
        rad('ICARE', 'MISTRAL', `Deux auteurs filmés à la sortie de la bijouterie, sacs pleins, direction place de l'Opéra. Je peux guider FAUCON.`),
      ], [`Une bijouterie est pillée rue de la Paix`, `Un passant est pris au milieu d'un groupe`]),
    ph('feux', `Trois feux dans une rue étroite`,
      `Des poubelles brûlent contre une devanture de la rue Saint-Honoré ; plus loin, une barricade de trottinettes s'embrase, batteries crépitantes, et une voiture en stationnement prend feu à son tour. La fumée noire aveugle le drone. Un extincteur, les pompiers sous escorte, ou rien : à chaque foyer son moyen.`,
      OBJ('o3'), [
        rad('ICARE', 'MISTRAL', `TROIS foyers actifs rue Saint-Honoré, fumée épaisse, visibilité réduite. Je perds les groupes.`),
        rad('SAPEUR 1', 'MISTRAL', `En attente rue de Rivoli. Je ne m'engage pas rue Saint-Honoré sans itinéraire dégagé et sans escorte.`),
        rad('MISTRAL 2', 'MISTRAL', `Feu de poubelles contre une façade : mon porte-extincteur peut le prendre. Pour la voiture, il me faut les pompiers.`),
      ], [`Feu de poubelles contre une devanture`, `Batteries de trottinettes embrasées`, `Une voiture en stationnement prend feu`]),
    ph('guet-apens', `Un agent isolé sur la fréquence`,
      `Les trois foyers sont traités. Rue du Marché Saint-Honoré, un groupe de la section mobile vient de tomber sur une barricade, avec des jets venus des deux bouts de la rue ; un agent, coupé des autres, appelle à l'aide sur la fréquence.`,
      T(150), [
        rad('MISTRAL 2', 'MISTRAL', `URGENT. Mon groupe BRAVO est pris à partie rue du Marché Saint-Honoré, barricade devant, jets derrière. UN agent isolé. Je demande un appui.`),
        rad('FAUCON 1', 'MISTRAL', `Je peux être sur l'agent isolé en QUATRE-ZÉRO secondes. À vos ordres.`),
      ], [`Un groupe est pris en guet-apens`, `Un agent isolé appelle à l'aide`, `Panne radio de soixante secondes sur le secteur`]),
    ph('dernier-carre', `Le dernier carré, place Vendôme`,
      `Ce qui reste des groupes se rassemble derrière une barricade à l'entrée de la place Vendôme, autour de la colonne. Ils sont une cinquantaine, filmés depuis une heure par le drone : c'est le moment d'aller chercher ceux qu'on a vus casser, et pas les autres.`,
      OBJ('o2'), [
        rad('ICARE', 'MISTRAL', `CINQ-ZÉRO personnes derrière la barricade, place Vendôme. J'ai SIX auteurs identifiés sur mes images, je vous les désigne un par un.`),
        rad('FAUCON 1', 'MISTRAL', `En position rue de Castiglione. Interpellation sur désignation, à votre ordre.`),
      ], [`Une barricade est montée à l'entrée de la place Vendôme`]),
    ph('devantures', `Les devantures à garder`,
      `Quatre auteurs sont en route vers l'officier de police judiciaire et les groupes se dissolvent dans les rues du quartier. Il reste des vitrines béantes rue de la Paix, des commerçants qui arrivent en pleine nuit, et un bilan à dresser devanture par devanture.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Les commerçants arrivent sur place. Faites garder les devantures ouvertes jusqu'à leur arrivée et rendez compte : vitrines, interpellations, blessés.`),
        voix('COMMERÇANT', `C'est maintenant que vous arrivez ? Ils ont tout pris en trois minutes. Qui va garder ma boutique, cette nuit ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Limiter les vitrines brisées à huit', 'limiter_degats', { max: 8 }),
    ob('o2', 'Interpeller au moins quatre auteurs sur faits constatés', 'interpeller', { count: 4 }),
    ob('o3', 'Traiter les trois feux de rue avant qu\'ils gagnent une façade', 'traiter_incidents', { target: 'feu', count: 3 }),
    os('o4', 'Ne laisser aucun agent isolé plus de trente secondes', 'personnalise', { target: 'agent_isole', seconds: 30 }),
  ],
  failures: [fail('trop_de_blesses', 'Trop de blessés parmi vos agents.', 6), fail('site_envahi', 'Une bijouterie est entièrement pillée.')],
  randomEvents: ['Passant pris au milieu d\'un groupe', 'Rideau forcé et alarme', 'Panne radio de soixante secondes', 'Un agent isolé appelle à l\'aide'],
  unique: 'La nuit et les rues étroites du quartier du Palais-Royal rendent la manœuvre plus difficile que n\'importe quel affrontement de jour.',
  difficulty: 4, chapter: 5, altRoles: ['journaliste', 'manifestant'], tags: ['nuit', 'pillage', 'miroir'],
});

/** Trois ponts à tenir en même temps. */
export const CDT_05 = mission({
  ...CDT,
  id: 'cdt-05-trois-ponts',
  title: 'Trois ponts',
  pitch: 'Concorde, Alexandre III, Invalides : un cortège veut passer la Seine vers l\'Assemblée nationale, vous n\'avez de quoi tenir fermement que deux ponts.',
  briefing: [
    `Un cortège non déclaré annonce une marche sur l'Assemblée nationale, le jour d'un vote sensible. Le préfet a interdit tout rassemblement dans un périmètre de deux cents mètres autour du palais. Le cortège, d'environ deux mille personnes, descend les Champs-Élysées et pourra emprunter le pont de la Concorde, le pont Alexandre III ou le pont des Invalides.`,
    `Vous commandez la compagnie : quatre sections, un canon à eau, un Centaure et un drone. Votre mission est d'interdire les trois ponts, de protéger le Palais Bourbon et de ne pas laisser un pont devenir un piège pour la foule. Un seul pont ouvert est une issue ; trois fermés sont un entonnoir.`,
    `Deux sections sur le pont de la Concorde, une section au pont Alexandre III, une en réserve à l'esplanade des Invalides. Le canon à eau reste derrière la première ligne ; vous ne l'engagez qu'après sommations et si la ligne est menacée. Gardez en permanence un couloir libre vers le cours la Reine pour les secours.`,
    `Les ponts font trente-six à quarante mètres de large : c'est étroit pour une foule de deux mille personnes. Ne provoquez pas de bousculade : une retraite doit toujours rester possible. Vous êtes autorité unique : la force est autorisée ou interdite par vous seul.`,
  ],
  type: 'barrage', place: 'Pont de la Concorde', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 4,
  crowd: crowd(2000, 'libertes', 0.4, 0.6, 0.08, { gilets_jaunes: 0.3, syndical: 0.25, etudiants: 0.15, black_bloc: 0.1, familles: 0.1, retraites: 0.1 },
    ['Avenue des Champs-Élysées', 'Place de la Concorde', 'Cours la Reine', 'Pont Alexandre III', 'Pont de la Concorde'], 0.5),
  forces: forces({ sections: 4, fourgons: 12, canonEau: 1, centaure: 1, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux mille personnes sans organisateur ; elles se scinderont probablement en deux colonnes à la Concorde.',
    'Une centaine de radicaux en tête, qui chercheront le pont de la Concorde.',
    ['Pont de la Concorde', 'Pont Alexandre III', 'Cours la Reine'],
    ['Fermer la circulation des deux rives avant l\'arrivée', 'Prépositionner le canon à eau au débouché du pont', 'Garder un couloir pour les secours']),
  phases: [
    ph('tetes-de-pont', `Trois têtes de pont`,
      `Deux sections sur le pont de la Concorde, une au pont Alexandre III, une en réserve sur l'esplanade des Invalides : les fourgons se mettent en travers des têtes de pont, côté rive droite. Le pont des Invalides, lui, n'a personne. Derrière vous, le Palais Bourbon ; devant, deux mille personnes qui descendent les Champs-Élysées.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Mission : INTERDIRE les ponts de la Concorde, Alexandre III et des Invalides. Périmètre interdit de DEUX-ZÉRO-ZÉRO mètres autour du Palais Bourbon.`, 'A'),
        rad('MISTRAL 3', 'MISTRAL', `En place pont Alexandre III, face nord. Je signale une péniche-restaurant amarrée au pied du pont, avec des clients à bord.`),
      ], [`Une péniche-restaurant pleine de clients est amarrée au pied du pont Alexandre III`]),
    ph('la-foule-teste', `La foule teste chaque pont`,
      `La tête de cortège débouche place de la Concorde et se scinde : une colonne vient s'appuyer sur le barrage du pont de la Concorde, l'autre longe le cours la Reine vers le pont Alexandre III. Elles poussent, reculent, comparent ; devant la première ligne, les rangs se tassent contre le parapet.`,
      TENS(0.5), [
        rad('ICARE', 'MISTRAL', `Tête à DEUX-ZÉRO-ZÉRO mètres du pont de la Concorde, QUATRE-ZÉRO-ZÉRO personnes devant la banderole. Seconde colonne sur le cours la Reine, direction Alexandre III.`),
        rad('MISTRAL 1', 'MISTRAL', `Contact sur le pont de la Concorde. Nature : poussée, sans coups. Les premiers rangs sont comprimés contre le parapet, côté amont.`),
      ], [`Une colonne contourne par le cours la Reine`, `Un cycliste est coincé entre la foule et le barrage`]),
    ph('invalides', `Le pont que personne ne garde`,
      `La tension monte, et une troisième colonne de cinq cents personnes file le long du quai vers le pont des Invalides, que vous n'avez pas pu garnir. La réserve est sur l'esplanade des Invalides : l'envoyer là-bas, c'est n'avoir plus rien pour les deux autres ponts.`,
      T(200), [
        rad('ICARE', 'MISTRAL', `CINQ-ZÉRO-ZÉRO personnes sur le cours la Reine, direction pont des Invalides. Aucune unité sur ce pont. Franchissement possible dans TROIS minutes.`),
        rad('CENTRAL', 'MISTRAL', `Dégarnissez le pont Alexandre III au profit du pont des Invalides.`),
        rad('MISTRAL 4', 'MISTRAL', `Réserve prête à embarquer. Pont des Invalides par le quai d'Orsay : DEUX minutes. À vos ordres.`),
      ], [`Une colonne file vers le pont des Invalides`, `La salle ordonne de dégarnir un pont`]),
    ph('densite', `Quatre personnes au mètre carré`,
      `Devant le barrage du pont de la Concorde, ceux de derrière poussent ceux de devant : plus de quatre personnes au mètre carré, des cris, une femme hissée par-dessus les têtes. Un pont est un goulet ; si la foule n'a pas de retraite vers la place, c'est contre vos boucliers qu'elle s'écrasera.`,
      T(200), [
        rad('ICARE', 'MISTRAL', `Densité critique devant le barrage de la Concorde, plus de QUATRE personnes au mètre carré. La retraite vers la place est encore ouverte, mais elle se remplit.`),
        rad('MISTRAL 2', 'MISTRAL', `Poussée sur ma ligne, jets de projectiles par-dessus les premiers rangs. Les gens devant moi ne peuvent plus reculer. Je demande vos ordres.`),
        rad('SANTÉ 1', 'MISTRAL', `Un malaise signalé dans la foule devant le pont. Il me faut un couloir par le cours la Reine.`),
      ], [`Densité critique devant la ligne`, `Malaise dans les premiers rangs`, `Une ambulance demande le passage par le cours la Reine`]),
    ph('desserrer', `Sommer, puis rendre de l'air`,
      `Tenir ne suffit plus : il faut desserrer. À portée de mégaphone, écharpe visible, les sommations ; puis un refoulement lent vers la place de la Concorde, issue libre devant la foule, le canon à eau en jet diffus seulement si la ligne est menacée. Le pont Alexandre III, lui, ne doit pas céder pendant que vous regardez ailleurs.`,
      OBJ('o1'), [
        rad('NEPTUNE 1', 'MISTRAL', `Derrière la première ligne, pont de la Concorde. Jet diffus possible sur votre ordre, après vos sommations.`),
        rad('MISTRAL 3', 'MISTRAL', `Pont Alexandre III : la seconde colonne revient sur moi, plus nombreuse. Je tiens, mais sans réserve.`),
      ], [`Retour de gaz par vent tournant`, `Jets de projectiles sur le pont Alexandre III`]),
    ph('ponts-a-la-nuit', `Les ponts à la nuit`,
      `Le pont de la Concorde a tenu vingt minutes. À la nuit tombante, les colonnes refluent vers les Champs-Élysées et les quais se vident ; il reste trois ponts à rouvrir dans le bon ordre, et un compte rendu où la salle cherchera d'abord le nombre de blessés.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Le vote est terminé au Palais Bourbon. Rouvrez les ponts un à un et rendez compte : franchissements, blessés, consommations.`),
        rad('MISTRAL 1', 'MISTRAL', `Plus personne devant mon barrage. Je reste en place jusqu'à votre ordre de levée.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Interdire le pont de la Concorde jusqu\'à la fin de la mission', 'tenir_position', { place: 'Pont de la Concorde', seconds: 1200 }),
    ob('o2', 'Interdire le pont Alexandre III', 'tenir_position', { place: 'Pont Alexandre III', seconds: 1200 }),
    ob('o3', 'Empêcher toute bousculade grave sur un pont', 'limiter_blesses', { max: 5 }),
    os('o4', 'Garder un couloir libre pour les secours sur le cours la Reine', 'proteger_site', { place: 'Cours la Reine' }),
  ],
  failures: [fail('ligne_enfoncee', 'Un pont est franchi et la foule atteint l\'Assemblée.'), fail('trop_de_blesses', 'Bousculade grave sur un pont.', 10)],
  randomEvents: ['Retour de gaz par vent tournant', 'Panne radio de soixante secondes', 'Ordre contradictoire de la salle', 'Une ambulance demande le passage'],
  unique: 'Trois ponts à tenir avec des forces pour deux : la Seine devient le principal outil, et le piège, du dispositif.',
  difficulty: 4, chapter: 6, tags: ['ponts', 'assemblee', 'interdite'],
});

/** Encerclement et sortie contrôlée dans le quartier des Halles (miroirs : manifestant, street medic). */
export const CDT_06 = mission({
  ...CDT,
  id: 'cdt-06-sortie-controlee',
  title: 'Sortie contrôlée',
  pitch: 'Soixante casseurs bouclés dans un îlot : les faire sortir un par un, sans que la nasse devienne un piège pour les innocents.',
  briefing: [
    `Dans l'après-midi, soixante individus ont dégradé des vitrines et jeté des projectiles sur vos sections, puis se sont repliés dans l'îlot compris entre la rue de Turbigo, la rue Saint-Denis et la rue de Rambuteau. Une centaine de manifestants paisibles se trouvent mêlés à eux, dont une poussette et un poste de soins improvisé dans un hall.`,
    `Vous commandez la compagnie : quatre sections, un drone. Votre mission est de boucler l'îlot, d'ouvrir une sortie contrôlée où chaque personne est identifiée, de procéder aux interpellations sur faits et de lever le bouclage en moins de vingt minutes. Vous décidez seul : de l'encerclement à la levée.`,
    `Deux sections sur les rues de Turbigo et de Rambuteau, une section à l'angle de la rue Saint-Denis, une en réserve. Annonce à la foule toutes les minutes. Le drone surveille le poste de soins du hall : n'y entrez que pour le sécuriser. Des interpellateurs se placent à la sortie.`,
    `Une nasse mal faite peut tuer. Gardez toujours une issue visible, laissez passer les secours, respectez le temps maximal de vingt minutes. Chaque personne retenue doit entendre l'annonce, c'est la condition de la légalité.`,
  ],
  type: 'interpellation_ciblee', place: 'Rue de Turbigo', timeOfDay: 17, weather: 'couvert', windFrom: 220, windSpeed: 3,
  crowd: crowd(180, 'hopital', 0.5, 0.55, 0.3, { soignants: 0.3, black_bloc: 0.3, familles: 0.15, curieux: 0.25 },
    ['Rue de Turbigo', 'Rue Saint-Denis', 'Rue Rambuteau', 'Boulevard de Sébastopol'], 0.1),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Un îlot clos de cent quatre-vingts personnes, dont soixante déterminées.',
    'Soixante individus encagoulés, parmi lesquels quelques organisateurs d\'un « acte » non déclaré.',
    ['Rue de Turbigo', 'Rue Rambuteau', 'Rue Saint-Denis'],
    ['Placer les interpellateurs à la sortie', 'Prévenir le SAMU du poste de soins', 'Annoncer la sortie à chaque minute']),
  phases: [
    ph('constat', `Les violences qui rendent le bouclage légal`,
      `Rue de Turbigo, soixante individus qui viennent de briser des vitrines et de lancer des projectiles sur vos sections se sont repliés dans l'îlot fermé par la rue Saint-Denis et la rue Rambuteau. Une centaine de manifestants paisibles sont mêlés à eux, dont une poussette ; dans un hall, des blouses blanches ont monté un poste de soins.`,
      T(100), [
        rad('CENTRAL', 'MISTRAL', `Auteurs de violences regroupés dans l'îlot Turbigo, Saint-Denis, Rambuteau, des tiers parmi eux. Vous avez la main.`),
        rad('ICARE', 'MISTRAL', `SIX-ZÉRO individus en noir dans l'îlot, mêlés à une centaine de personnes calmes. Une poussette. Un poste de soins dans un hall, côté rue Saint-Denis.`),
      ], [`Un habitant filme depuis sa fenêtre`]),
    ph('bouclage', `Boucler en laissant une porte`,
      `Deux sections ferment la rue de Turbigo et la rue Rambuteau, une troisième tient l'angle de la rue Saint-Denis. Il faut une sortie : deux mètres de large, quatre agents, visible de partout, et une voix au mégaphone qui dise à ceux qui sont retenus pourquoi, pour combien de temps, et par où sortir.`,
      T(120), [
        rad('MISTRAL 1', 'MISTRAL', `En place rue de Turbigo. Où voulez-vous la sortie contrôlée, et qui la tient ?`),
        rad('MISTRAL 3', 'MISTRAL', `Angle Saint-Denis tenu. Les gens demandent ce qui se passe : personne ne leur a encore rien dit.`),
      ], [`Une poussette avec un enfant est repérée dans le bouclage`, `Un journaliste demande à sortir`]),
    ph('filtrage', `Un par un, par la rue Rambuteau`,
      `Les personnes passent une à une devant les interpellateurs, rue Rambuteau, pendant que le drone compare les visages et les tenues à ses images de l'après-midi. Les familles d'abord. Au fond de l'îlot, une douzaine de silhouettes en noir se regroupent et regardent les toits.`,
      T(200), [
        rad('MISTRAL 2', 'MISTRAL', `Premières sorties par la rue Rambuteau : familles, soignants, aucun fait à leur reprocher. Je laisse passer.`),
        rad('ICARE', 'MISTRAL', `Groupe de UN-DEUX en tenue noire à l'ouest de l'îlot. Deux d'entre eux figurent sur mes images des vitrines. Ils changent de veste.`),
      ], [`Des individus changent de tenue au fond de l'îlot`]),
    ph('hall', `Le poste de soins du hall`,
      `Dans un hall de la rue Saint-Denis, des soignantes en blouse ont allongé trois personnes sur des cartons : une crise d'angoisse, une entorse, une femme qui ne répond plus très bien. Elles demandent une ambulance ; pour la faire entrer, il faut ouvrir le bouclage sans le défaire.`,
      T(150), [
        voix('SOIGNANTE', `On a une femme qui fait un malaise dans le hall. Vous nous laissez sortir avec elle, ou vous faites entrer une ambulance ?`),
        rad('SANTÉ 1', 'MISTRAL', `En attente rue de Turbigo. Je n'entre pas dans votre dispositif sans couloir et sans escorte.`),
      ], [`Malaise d'une manifestante dans le bouclage`, `Le poste de soins du hall demande une ambulance`]),
    ph('percee', `La poussée rue Saint-Denis`,
      `Le groupe en noir tente de forcer la ligne de la rue Saint-Denis pendant que des bouteilles tombent d'un toit ; de l'extérieur, une cinquantaine de personnes poussent pour « libérer » les retenus. Dix minutes se sont écoulées : il faut finir le tri, interpeller ceux que le drone a désignés et lever le bouclage avant la vingtième.`,
      OBJ('o2'), [
        rad('MISTRAL 3', 'MISTRAL', `Tentative de percée rue Saint-Denis, jets de projectiles depuis un toit. Poussée extérieure de CINQ-ZÉRO personnes dans mon dos.`),
        rad('CENTRAL', 'MISTRAL', `Votre bouclage dure depuis UN-ZÉRO minutes. Réévaluez : le maximum est de DEUX-ZÉRO.`),
      ], [`Jets de bouteilles depuis un toit`, `Poussée extérieure pour libérer les personnes retenues`, `Un groupe tente de s'échapper par les toits`]),
    ph('levee', `La levée et le compte des minutes`,
      `Le bouclage est levé et l'îlot rendu à la circulation, de la rue de Turbigo à la rue Rambuteau. Sur votre compte rendu, deux colonnes compteront autant que les interpellations : la durée exacte de l'encerclement et le nombre d'annonces faites aux personnes retenues.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Bouclage levé, reçu. Compte rendu attendu : durée, annonces, sorties, interpellations, blessés.`),
        rad('MISTRAL 2', 'MISTRAL', `Les personnes interpellées sont regroupées rue Rambuteau pour remise à l'officier de police judiciaire. Fiches en cours.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Interpeller au moins dix auteurs sur faits constatés', 'interpeller', { count: 10 }),
    ob('o2', 'Lever le bouclage en moins de vingt minutes', 'duree', { seconds: 1200 }),
    ob('o3', 'Garder une issue visible et annoncée pendant toute la durée', 'sommations_regulieres', { count: 20 }),
    os('o4', 'Ne laisser personne blessé par la nasse', 'limiter_blesses', { max: 2 }),
  ],
  failures: [fail('bavure_grave', 'Une personne est blessée gravement dans la nasse.'), fail('temps', 'Bouclage tenu plus de vingt minutes.', 1200)],
  randomEvents: ['Malaise d\'un manifestant dans la nasse', 'Un journaliste réclame la sortie', 'Le poste de soins est signalé à la radio', 'Un bloc tente de s\'échapper par les toits'],
  unique: 'Un encerclement où chaque minute passe au compte rendu : la durée de la nasse devient une note.',
  difficulty: 4, chapter: 6, altRoles: ['manifestant', 'street_medic'], tags: ['nasse', 'miroir'],
});

/** Visite officielle d'un chef d'État fictif. */
export const CDT_07 = mission({
  ...CDT,
  id: 'cdt-07-cortege-officiel',
  title: 'Cortège officiel',
  pitch: 'Le président de la République de Valdoria traverse Paris en voiture, et un comité d\'opposants l\'attend au pied du pont Alexandre III.',
  briefing: [
    `La République de Valdoria envoie son président au « Sommet des Capitales ». Son cortège doit relier les Invalides à l'Élysée par le pont Alexandre III, les Champs-Élysées et la rue du Faubourg-Saint-Honoré. Le « Comité Valdoria Libre », opposant, a déclaré un rassemblement statique de deux cents personnes sur l'esplanade des Invalides.`,
    `Vous commandez la compagnie : trois sections, un peloton de gendarmes mobiles, un Centaure, un drone. Votre mission est d'assurer le passage du cortège dans les temps, sans qu'aucun manifestant ne s'approche à moins de cent mètres du convoi, tout en laissant le rassemblement déclaré exercer son droit.`,
    `Le cortège passe à 11 h 12 : coupez le pont Alexandre III et le cours la Reine à 10 h 45. Section 1 sur l'esplanade face au comité, section 2 sur le pont, section 3 avenue Winston-Churchill. Le Centaure garde le carrefour de la Concorde. Au passage, le comité hue : laissez faire. Aucune interpellation sans fait de violence.`,
    `L'image publique est essentielle : un seul geste de trop, filmé, ferait la une et gênerait l'État invité. Interdisez la montée sur le pont, mais ne bloquez pas les piétons. Le passage du convoi ne tolère pas un retard de plus d'une minute.`,
  ],
  type: 'visite_officielle', place: 'Pont Alexandre III', timeOfDay: 10.5, weather: 'clair', windFrom: 300, windSpeed: 3,
  crowd: crowd(200, 'libertes', 0.2, 0.3, 0.02, { militants: 0.4, familles: 0.15, curieux: 0.4, etudiants: 0.05 },
    ['Esplanade des Invalides', 'Pont Alexandre III', 'Cours la Reine'], 0.4),
  forces: forces({ sections: 3, fourgons: 9, pelotons: 1, centaure: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Deux cents opposants déclarés, quelques curieux ; ambiance bruyante, non violente.',
    'Aucun signalement ; une poignée d\'isolés pourrait jeter un objet.',
    ['Pont Alexandre III', 'Esplanade des Invalides', 'Avenue Winston Churchill'],
    ['Couper les ponts et les quais à 10 h 45', 'Poster des agents sur chaque rue perpendiculaire', 'Garder la voie de secours libre']),
  phases: [
    ph('jalonnement', `Un agent tous les vingt-cinq mètres`,
      `Dix heures trente. Du pont Alexandre III à l'avenue Winston Churchill, il faut un agent tous les vingt-cinq mètres aux points sensibles, les rues perpendiculaires fermées, le stationnement vérifié. Sur l'esplanade des Invalides, les deux cents opposants du « Comité Valdoria Libre » s'installent derrière leurs banderoles, comme ils l'ont déclaré.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `Convoi officiel, passage prévu à UN-UN heures UN-DEUX. Coupure du pont Alexandre III et du cours la Reine à UN-ZÉRO heures QUATRE-CINQ.`, 'A'),
        rad('ÉPERVIER 1', 'MISTRAL', `Peloton en place avenue Winston Churchill. CENTAURE UN tient le carrefour côté Concorde.`),
      ], [`Un camion de livraison est resté garé sur le parcours`]),
    ph('colis', `Un sac sans propriétaire`,
      `À vingt minutes du passage, un agent signale un sac de sport posé contre un candélabre du pont Alexandre III. Personne ne le réclame. Sur l'esplanade des Invalides, le rassemblement chante ; la liaison a obtenu qu'il reste sur le terre-plein.`,
      T(180), [
        rad('MISTRAL 2', 'MISTRAL', `Sac abandonné au pied d'un candélabre, milieu du pont Alexandre III, côté amont. Personne autour. Vos ordres ?`),
        rad('LIAISON', 'MISTRAL', `Les organisateurs du comité s'engagent à ne pas dépasser le terre-plein de l'esplanade. Ils demandent à rester visibles du convoi.`),
      ], [`Un colis est oublié sur le pont`, `Un car de tourisme est bloqué par les fermetures`]),
    ph('itineraire', `Changement d'itinéraire`,
      `La salle annonce un changement : après le pont, le convoi ne prendra pas l'avenue Winston Churchill mais le cours la Reine, vers la place de la Concorde. Il vous reste six minutes pour basculer la section 3, pendant que le drone suit trois personnes qui longent le parapet avec un rouleau de tissu.`,
      T(150), [
        rad('CENTRAL', 'MISTRAL', `Changement d'itinéraire : après le pont, le convoi prendra le cours la Reine vers la Concorde. Passage maintenu à UN-UN heures UN-DEUX.`, 'C'),
        rad('ICARE', 'MISTRAL', `Trois personnes longent le parapet du pont Alexandre III, côté aval, un rouleau de tissu à la main. Pas d'objet dangereux visible.`),
      ], [`Le convoi change d'itinéraire`]),
    ph('passage', `Huit véhicules à trente à l'heure`,
      `Motards en tête, le convoi de huit véhicules s'engage sur le pont Alexandre III à trente kilomètres-heure. Sur l'esplanade, le comité hue et agite ses drapeaux, comme c'est son droit ; trois personnes enjambent une barrière avec leur banderole, et un œuf part du trottoir.`,
      OBJ('o1'), [
        rad('CENTRAL', 'MISTRAL', `Convoi en vue, DEUX minutes.`),
        rad('MISTRAL 1', 'MISTRAL', `Le comité hue le convoi depuis le terre-plein, sans mouvement. Trois personnes viennent de franchir une barrière avec une banderole, côté pont.`),
      ], [`Trois personnes franchissent une barrière avec une banderole`, `Un œuf est lancé depuis le trottoir`, `Un journaliste franchit le cordon`]),
    ph('trois-militants', `Trois militants contre le parapet`,
      `Le convoi est passé à l'heure. Contre le parapet du pont Alexandre III, trois militants du comité sont retenus avec leur banderole roulée ; ils n'ont frappé personne ni rien lancé, et quatre objectifs de presse attendent de voir ce que vous en ferez.`,
      T(120), [
        rad('MISTRAL 2', 'MISTRAL', `Je retiens les trois porteurs de la banderole. Aucune violence de leur part. Contrôle d'identité, ou je les laisse rejoindre l'esplanade ?`),
        voix('JOURNALISTE', `Commandant, ils sont en état d'arrestation ? Pour une banderole ? Vous confirmez ?`),
      ], [`Des journalistes filment les trois militants retenus`]),
    ph('levee', `Rouvrir dans les cinq minutes`,
      `Le dernier véhicule a quitté le cours la Reine. Chaque minute de fermeture en trop se paie en embouteillages autour des Invalides : il faut rouvrir le pont Alexandre III, laisser le comité replier ses banderoles sur l'esplanade, et rendre compte.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Convoi arrivé à destination. Levez le dispositif et rouvrez à la circulation.`),
        rad('LIAISON', 'MISTRAL', `Le comité annonce sa dispersion dans UN-ZÉRO minutes, par la station Invalides.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Faire passer le convoi sans retard supérieur à une minute', 'escorter', { place: 'Pont Alexandre III' }),
    ob('o2', 'Garder les opposants à plus de cent mètres du convoi', 'proteger_site', { place: 'Pont Alexandre III' }),
    os('o3', 'Ne procéder à aucune interpellation sans fait de violence', 'zero_bavure'),
    os('o4', 'Rouvrir les rues dans les cinq minutes qui suivent', 'duree', { seconds: 300 }),
  ],
  failures: [fail('bavure_grave', 'Un opposant est molesté devant les caméras.'), fail('personnalise', 'Le convoi est stoppé par un manifestant.')],
  randomEvents: ['Un camion de livraison oublié sur la voie', 'Un journaliste franchit le cordon', 'Tentative de banderole sur le pont', 'Retard du convoi de deux minutes'],
  unique: 'Une mission de protocole où le moindre geste est filmé et où la neutralité de l\'ordre public se mesure.',
  difficulty: 3, chapter: 6, tags: ['visite', 'protocole'],
});

/** Une heure du matin : fête et foule sur le quai (miroir : secouriste). */
export const CDT_08 = mission({
  ...ADJ,
  id: 'cdt-08-une-heure-du-matin',
  title: 'Une heure du matin',
  pitch: 'Fin de fête sur les quais de la Seine : deux mille fêtards, un pont, une nuit chaude et des secours qui doivent passer.',
  briefing: [
    `Fin de soirée de la Fête de la musique, quai de Conti et pont des Arts. Deux mille personnes restent sur les quais malgré la fermeture des débits. L'alcool, la chaleur et les haut-parleurs poussent la tension. Une bagarre éclate vers 1 h du matin, puis un groupe jette des bouteilles sur une patrouille.`,
    `Vous commandez la demi-compagnie : deux sections, des BRAV-M, un drone. Votre mission est de vider les quais sans heurts, de garder libre l'accès des secours et d'éviter qu'un mouvement de foule sur le pont Neuf ne fasse des blessés.`,
    `Section 1 sur le quai de Conti, section 2 sur le quai des Grands Augustins. Annonce au mégaphone toutes les dix minutes. Vous vous servez des escaliers des quais comme d'un entonnoir pour canaliser, jamais pour piéger. Les BRAV-M interviennent sur les bagarres. Les pompiers sont à demander dès les premiers malaises.`,
    `Pas de lacrymogène sur une foule en fête sur des quais étroits : un mouvement de panique vers la Seine serait dramatique. Privilégiez la parole, la lumière et la présence.`,
  ],
  type: 'evenement_festif', place: 'Quai de Conti', timeOfDay: 1, weather: 'clair', windFrom: 180, windSpeed: 1,
  crowd: crowd(2000, '', 0.3, 0.5, 0.03, { fetards: 0.7, etudiants: 0.15, curieux: 0.15 },
    ['Quai de Conti', 'Pont Neuf', 'Quai des Grands Augustins', 'Quai Voltaire'], 0.2),
  forces: forces({ sections: 2, fourgons: 6, bravm: 3, drone: true, pompiers: 2, samu: 2 }),
  intel: intel(
    'Deux mille fêtards, ambiance joyeuse devenant tendue après minuit ; beaucoup d\'alcool.',
    'Aucun groupe organisé ; quelques individus alcoolisés cherchent la bagarre.',
    ['Pont Neuf', 'Quai de Conti', 'Quai des Grands Augustins'],
    ['Demander des secours dès la première heure', 'Garder les escaliers des quais ouverts', 'Annoncer la fermeture des quais']),
  phases: [
    ph('fin-de-fete', `Les quais après la fermeture`,
      `Une heure du matin, quai de Conti. Les débits ont fermé, mais deux mille personnes restent sur les quais et le pont des Arts, bouteilles à la main, enceintes à fond. Vos deux sections sont en place de part et d'autre du Pont Neuf, casques à la ceinture ; la seule arme utile cette nuit est la voix.`,
      TENS(0.42), [
        rad('CENTRAL', 'MISTRAL', `Quais à vider avant DEUX heures. Pas de force sur une foule festive : présence, lumière, annonces.`, 'A'),
        rad('ICARE', 'MISTRAL', `DEUX MILLE personnes entre le pont des Arts et le Pont Neuf. Densité modérée, ambiance festive, quelques groupes très alcoolisés.`),
      ], [`Un fêtard grimpe sur la rambarde du pont des Arts`]),
    ph('rixe', `Rixe au pied de l'escalier`,
      `La tension monte d'un coup : une rixe éclate entre deux groupes au pied de l'escalier du quai de Conti, et des bouteilles volent vers la patrouille venue séparer. Autour, la foule recule en désordre vers le Pont Neuf ; à deux mètres du bord, une jeune femme s'est assise par terre, la tête entre les genoux.`,
      T(200), [
        rad('FAUCON 1', 'MISTRAL', `Rixe quai de Conti, UN-CINQ personnes, bouteilles lancées sur la patrouille. Je peux séparer, à votre ordre.`),
        rad('MISTRAL 1', 'MISTRAL', `Malaise d'une jeune femme au bord du quai, consciente. Je demande SANTÉ, je la garde.`),
      ], [`Une rixe éclate entre deux groupes`, `Malaise d'une jeune femme au bord du quai`, `Un fêtard tombe dans la Seine`]),
    ph('pont-neuf', `Le Pont Neuf se remplit`,
      `Ceux qui fuient la rixe et ceux qui arrivent du quai des Grands Augustins se croisent sur le Pont Neuf, dont les trottoirs se bouchent en une minute. La densité grimpe au-dessus de quatre personnes au mètre carré ; il faut fermer une entrée, ouvrir deux sorties et parler à la foule avant qu'elle ne pousse.`,
      FOULE('dispersion'), [
        rad('ICARE', 'MISTRAL', `Densité critique sur le Pont Neuf, plus de QUATRE personnes au mètre carré, côté rive gauche. Deux flux se croisent.`),
        rad('SAPEUR 1', 'MISTRAL', `Un camion de livraison bloque mon accès par la rue Dauphine. Il me faut un autre itinéraire jusqu'au quai.`),
      ], [`Mouvement de foule vers l'escalier du quai`, `Un camion de livraison bloque l'accès des secours`, `Un pétard est pris pour un coup de feu`]),
    ph('ecoulement', `L'écoulement vers le métro`,
      `La foule a commencé à partir. Par vagues, elle remonte du quai de Conti vers les stations Pont Neuf, Odéon et Saint-Michel ; les escaliers des quais servent d'entonnoir, jamais de piège. Quelques groupes s'attardent autour des enceintes : ce sont eux qu'il reste à convaincre.`,
      OBJ('o1'), [
        rad('MISTRAL 2', 'MISTRAL', `Quai des Grands Augustins : la foule s'écoule vers Saint-Michel, sans incident. Il me reste une centaine de personnes autour d'une enceinte.`),
        voix('FÊTARD', `Allez, commandant, une dernière chanson et on s'en va ! C'est la Fête de la musique, non ?`),
      ], [`Une sonorisation tombe en panne : son public se déplace d'un bloc vers le pont`]),
    ph('quais-vides', `Les quais rendus à la nuit`,
      `Les quais sont vides, de l'Institut de France au Pont Neuf, et les derniers fêtards remontent vers le boulevard Saint-Germain. Les pompiers font leurs comptes : malaises, chutes, coupures ; la salle, elle, veut d'abord savoir si quelqu'un a touché l'eau.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Quais vides, reçu. Bilan attendu : malaises, blessés, personnes tombées à l'eau, interpellations.`),
        rad('SAPEUR 1', 'MISTRAL', `Je vous transmets mon bilan des prises en charge dès que mes équipes sont regroupées quai de Conti.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Vider les quais sans emploi de la force', 'evacuer', { place: 'Quai de Conti' }),
    ob('o2', 'Prévenir toute compression grave sur le pont Neuf', 'limiter_blesses', { place: 'Pont Neuf', max: 3 }),
    os('o3', 'Traiter les malaises avec les secours en moins de quatre minutes', 'traiter_incidents', { target: 'malaise', count: 3 }),
    os('o4', 'Faire respecter l\'annonce toutes les dix minutes', 'sommations_regulieres', { count: 6 }),
  ],
  failures: [fail('trop_de_blesses', 'Mouvement de foule grave sur le pont.', 8), fail('victime_non_secourue', 'Une victime n\'est pas secourue à temps.')],
  randomEvents: ['Chute d\'un fêtard dans la Seine', 'Bagarre entre deux groupes', 'Un camion de livraison bloque l\'accès des secours', 'Panne de sonorisation'],
  unique: 'Pas de revendication, seulement une foule joyeuse qui peut basculer : la prévention vaut mieux que la force.',
  difficulty: 3, chapter: 5, altRoles: ['secouriste'], tags: ['fete', 'quais', 'miroir'],
});

/** La Seine monte : catastrophe naturelle sur les quais (miroir : secouriste). */
export const CDT_09 = mission({
  ...CDT,
  id: 'cdt-09-la-seine-monte',
  title: 'La Seine monte',
  pitch: 'La crue noie les berges, mille curieux s\'agglutinent sur les ponts et des riverains attendent les secours.',
  briefing: [
    `La Seine a franchi la cote d'alerte. Les berges basses sont noyées, les voies sur berge fermées. Les curieux se pressent sur le pont de l'Alma, le pont d'Iéna et le quai d'Orsay. Une dizaine de riverains refusent d'évacuer des péniches amarrées.`,
    `Vous commandez la compagnie, renforcée des pompiers de Paris. Votre mission est d'écarter les curieux des berges, d'ouvrir un couloir aux secours, d'évacuer les riverains récalcitrants et de garder les ponts ouverts aux véhicules de crue. Il n'y a pas d'ennemi : c'est un exercice de sang-froid.`,
    `Section 1 sur le quai d'Orsay, section 2 sur le quai Branly, sections 3 et 4 sur les ponts. Les pompiers viennent par la rue de l'Université. Le Centaure, haut sur roues, franchit les chaussées inondées pour atteindre les riverains isolés. Annoncez l'évacuation toutes les cinq minutes et organisez la circulation à pied.`,
    `L'eau monte de plusieurs centimètres par heure et le courant forcit : ne retardez pas une évacuation pour une négociation. Écartez les badauds avant qu'un enfant glisse. Aucune force : seulement des gestes et la voix.`,
  ],
  type: 'catastrophe', place: 'Quai d\'Orsay', timeOfDay: 9, weather: 'pluie', windFrom: 230, windSpeed: 7,
  crowd: crowd(1000, '', 0.1, 0.15, 0, { curieux: 0.6, riverains: 0.25, familles: 0.15 },
    ['Quai d\'Orsay', 'Pont de l\'Alma', 'Quai Branly', 'Pont d\'Iéna'], 0.2),
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, drone: true, pompiers: 6, samu: 2 }),
  intel: intel(
    'Mille curieux, riverains inquiets ; la crue gagne les berges basses.',
    'Aucun radical ; risque de panique si l\'eau dépasse le quai.',
    ['Quai d\'Orsay', 'Pont de l\'Alma', 'Quai Branly'],
    ['Évacuer les péniches avant midi', 'Ouvrir un couloir aux secours sur le quai Branly', 'Écarter les curieux du bord de l\'eau']),
  phases: [
    ph('rampes', `Fermer les rampes des berges`,
      `Neuf heures, sous la pluie. La Seine a recouvert les berges basses du quai d'Orsay et l'eau lèche les premières marches des rampes ; un millier de curieux se penchent aux parapets et descendent photographier le courant. Il faut fermer chaque rampe et faire reculer tout le monde, à la voix et au geste.`,
      OBJ('o2'), [
        rad('CENTRAL', 'MISTRAL', `Crue de la Seine, cote d'alerte franchie. Fermez les accès aux berges, du quai d'Orsay au pont d'Iéna. Aucune force : il n'y a que des curieux.`, 'A'),
        rad('MISTRAL 1', 'MISTRAL', `Quai d'Orsay : une cinquantaine de personnes sont descendues sur la rampe pour photographier. L'eau est à leurs pieds.`),
      ], [`Un badaud s'obstine à photographier au bord du quai`, `La chaussée des rampes est glissante`]),
    ph('peniches', `Dix riverains sur leurs péniches`,
      `Les curieux sont remontés derrière les parapets. Quai Branly, dix riverains refusent de quitter leurs péniches, dont les amarres se tendent à chaque vague ; les pompiers arrivent par la rue de l'Université, et le Centaure, haut sur roues, peut franchir la chaussée inondée pour aller les chercher.`,
      OBJ('o1'), [
        rad('SAPEUR 1', 'MISTRAL', `Deux péniches à évacuer quai Branly, UN-ZÉRO personnes à bord. J'arrive par la rue de l'Université : il me faut le passage libre jusqu'au quai.`),
        rad('CENTAURE 1', 'MISTRAL', `Je peux franchir la chaussée inondée du quai Branly et ramener les riverains, à votre ordre.`),
        voix('RIVERAIN', `Trente ans que je vis sur ce bateau ! Il a tenu toutes les crues, je ne le laisse pas !`),
      ], [`Un riverain refuse de quitter sa péniche`, `Un chien tombe à l'eau`]),
    ph('pic', `Dix centimètres de plus`,
      `Les riverains sont à terre quand l'eau gagne encore dix centimètres et atteint le haut du quai Branly. Le périmètre doit reculer d'autant ; sur le pont de l'Alma, les curieux venus voir le niveau s'agglutinent contre le parapet, au-dessus du courant.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `La cote vient de gagner UN-ZÉRO centimètres. Reculez votre périmètre et gardez les ponts ouverts aux véhicules de crue.`),
        rad('ICARE', 'MISTRAL', `Densité élevée sur le pont de l'Alma, côté amont : les gens se penchent au parapet pour voir le niveau.`),
      ], [`Un enfant glisse sur la berge`, `Un morceau de quai s'effondre`, `Panne radio de soixante secondes`]),
    ph('decrue', `Le niveau stagne`,
      `Vers la fin de la matinée le niveau stagne, puis commence à baisser sous la pluie fine. Les curieux se lassent et quittent les ponts ; restent les rampes à garder fermées, du quai d'Orsay au pont d'Iéna, et des riverains à qui il faudra dire quand ils pourront remonter à bord.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `La cote se stabilise. Maintenez les berges fermées jusqu'à nouvel ordre et rendez compte : évacués, blessés, incidents.`),
        rad('SAPEUR 1', 'MISTRAL', `Mes équipes restent quai Branly pour surveiller les amarres. Gardez-moi le couloir de la rue de l'Université.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Évacuer tous les riverains des berges basses', 'evacuer', { place: 'Quai Branly', target: 'riverain' }),
    ob('o2', 'Écarter la foule du bord de l\'eau', 'disperser', { place: 'Quai d\'Orsay' }),
    os('o3', 'Garder un couloir libre aux secours', 'proteger_site', { place: 'Rue de l\'Université' }),
    os('o4', 'Ne déplorer aucun blessé grave', 'limiter_blesses', { max: 1 }),
  ],
  failures: [fail('victime_non_secourue', 'Un riverain est emporté par l\'eau.'), fail('trop_de_blesses', 'Trop de blessés.', 6)],
  randomEvents: ['Un chien tombe à l\'eau', 'Panne radio de soixante secondes', 'Un badaud s\'obstine à photographier au bord du quai', 'Effondrement d\'un morceau de quai'],
  unique: 'Il n\'y a pas d\'adversaire : la mission se joue entre l\'eau, la foule et le temps.',
  difficulty: 2, chapter: 6, altRoles: ['secouriste'], tags: ['crue', 'catastrophe', 'miroir'],
});

/** Contre-manifestation : deux cortèges adverses à séparer. */
export const CDT_10 = mission({
  ...CDT,
  id: 'cdt-10-double-front',
  title: 'Double front',
  pitch: 'Deux comités défilent le même jour autour de l\'Opéra, l\'un pour, l\'autre contre le « Grand Axe » : être le mur qui ne penche d\'aucun côté.',
  briefing: [
    `Un projet d'urbanisme, le « Grand Axe », divise la ville. Le comité « Oui au Grand Axe » défile depuis la rue Scribe ; le comité « Non au Grand Axe » arrive par la rue Auber. Les deux cortèges ont déclaré place de l'Opéra, par erreur ou par provocation. Six cents personnes de chaque côté, avec des franges qui ne souhaitent que l'affrontement.`,
    `Vous commandez la compagnie : quatre sections, douze fourgons, un drone, un canon à eau. Votre mission est de maintenir une zone tampon de cent cinquante mètres entre les deux cortèges, de traiter chaque camp de la même façon et d'obtenir des dispersions décalées de vingt minutes.`,
    `Section 1 rue Scribe, section 2 rue Auber, section 3 sur le boulevard des Capucines, section 4 en réserve. Chaque camp envoie une trentaine de personnes par les rues latérales pour provoquer l'autre : coupez-les. Utilisez la liaison avec les deux organisateurs. Le canon à eau reste en retrait : sa vue seule calme parfois.`,
    `La neutralité est évaluée : l'écart d'emploi de la force entre les deux camps ne doit pas dépasser 20 %. Toute accusation de partialité, filmée, vous coûte la mission. Ne cédez pas aux cris d'un camp qui voudrait que vous chargiez l'autre.`,
  ],
  type: 'manifestation_declaree', place: 'Place de l\'Opéra', timeOfDay: 15.5, weather: 'nuageux', windFrom: 200, windSpeed: 3,
  crowd: crowd(1200, 'logement', 0.35, 0.6, 0.08, { militants: 0.3, riverains: 0.25, familles: 0.15, black_bloc: 0.08, curieux: 0.22 },
    ['Rue Scribe', 'Rue Auber', 'Place de l\'Opéra', 'Boulevard des Capucines'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Douze cents personnes, six cents par camp ; ambiance tendue, jets de slogans.',
    'Une centaine de radicaux dans chaque camp, en franges.',
    ['Place de l\'Opéra', 'Rue Auber', 'Rue Halévy'],
    ['Fermer la rue Halévy', 'Prévoir une dispersion décalée', 'Demander l\'appui du drone aux deux cortèges']),
  phases: [
    ph('zone-tampon', `Cent cinquante mètres de vide`,
      `Place de l'Opéra, devant le palais Garnier. Le « Oui au Grand Axe » arrive par la rue Scribe, en orange, le « Non au Grand Axe » par la rue Auber, en violet : six cents personnes de chaque côté, et entre elles vos sections, qui tiennent cent cinquante mètres de chaussée vide.`,
      T(200), [
        rad('LIAISON', 'MISTRAL', `Les deux comités acceptent de rester chacun de leur côté. Chacun affirme que c'est l'autre qui a déclaré la place par provocation.`),
        rad('CENTRAL', 'MISTRAL', `Mission : vous interposer entre les deux cortèges. La salle suit l'équilibre de vos interventions, camp par camp.`, 'A'),
      ], [`Les deux cortèges se font face de part et d'autre de la zone tampon`]),
    ph('rues-laterales', `Trente personnes par la rue Halévy`,
      `Chaque camp détache une trentaine de personnes par les rues latérales pour aller provoquer l'autre : les orange par la rue Halévy, les violets par le boulevard des Capucines. Ils ne sont pas masqués et ne portent rien ; ils veulent être vus. Les couper, c'est déjà toucher à un camp : il faudra toucher à l'autre de la même façon.`,
      TENS(0.47), [
        rad('ICARE', 'MISTRAL', `TROIS-ZÉRO personnes du camp orange contournent par la rue Halévy. TROIS-ZÉRO du camp violet par le boulevard des Capucines. Jonction possible derrière l'Opéra dans DEUX minutes.`),
        rad('MISTRAL 4', 'MISTRAL', `Réserve disponible. Je peux couper la rue Halévy ou le boulevard des Capucines, pas les deux.`),
      ], [`Chaque camp envoie un groupe par les rues latérales`]),
    ph('jets-croises', `Les jets croisés par-dessus vos casques`,
      `La tension vient de franchir un seuil : des bouteilles, des œufs et des fumigènes passent par-dessus vos lignes dans les deux sens. Sur les marches du palais Garnier, place de l'Opéra, les spectateurs d'une matinée sortent en tenue de ville entre les deux foules, et de chaque côté on vous crie de charger ceux d'en face.`,
      T(240), [
        rad('MISTRAL 2', 'MISTRAL', `Jets croisés par-dessus ma ligne, rue Auber. Des deux côtés. J'attends vos ordres.`),
        voix('MANIFESTANT EN ORANGE', `Vous les protégez, eux ! Ça fait une heure que vous nous tournez le dos, à nous !`),
        rad('CENTRAL', 'MISTRAL', `Attention : une vidéo vous accuse de partialité. La salle compte vos interventions de chaque côté.`, 'T'),
      ], [`Des spectateurs sortent de l'Opéra entre les deux foules`, `Une accusation de partialité est filmée`, `Jets croisés par-dessus la ligne`]),
    ph('tenir-le-vide', `Quinze minutes sans contact`,
      `Tout tient à ce vide entre les deux camps, place de l'Opéra : tant qu'aucun groupe ne le traverse, il n'y a que du bruit. Le canon à eau est en retrait boulevard des Capucines, visible des deux côtés ; les interpellations, s'il en faut, se feront dans les deux camps ou dans aucun.`,
      OBJ('o1'), [
        rad('NEPTUNE 1', 'MISTRAL', `En retrait boulevard des Capucines, visible des deux cortèges. Je ne bouge que sur votre ordre.`),
        rad('MISTRAL 1', 'MISTRAL', `Rue Scribe : une dizaine d'individus du camp orange cherchent le contact. Faits constatés sur DEUX d'entre eux.`),
      ], [`Un groupe tente de traverser la zone tampon`]),
    ph('dispersions-decalees', `Vingt minutes d'écart`,
      `Quinze minutes sans contact : les organisateurs sont mûrs pour partir, à condition de ne pas partir en même temps. Il faut obtenir le départ d'un camp par le boulevard des Capucines, tenir l'autre vingt minutes rue Auber, et choisir lequel part le premier sans que cela ressemble à une faveur.`,
      FOULE('dispersion'), [
        rad('LIAISON', 'MISTRAL', `Le comité orange accepte de partir le premier. Le comité violet refuse d'attendre : il veut partir en même temps, ou avant.`),
        voix('ORGANISATRICE EN VIOLET', `Pourquoi eux d'abord ? Vous avez tiré au sort, ou vous avez choisi ?`),
      ], [`Un camp refuse la dispersion décalée`, `Panne radio de soixante secondes`]),
    ph('camp-par-camp', `Le décompte, camp par camp`,
      `Les deux cortèges se dispersent l'un après l'autre et la place de l'Opéra retrouve ses autobus. Sur le compte rendu, tout sera compté deux fois : les annonces, les refoulements, les interpellations, une colonne pour chaque camp, et l'écart entre les deux.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Dispersion constatée. Transmettez vos chiffres camp par camp : annonces, emplois de la force, interpellations.`),
        rad('LIAISON', 'MISTRAL', `Les deux comités demandent à être reçus séparément : chacun veut se plaindre de votre partialité envers l'autre.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Aucun contact entre les deux cortèges', 'tenir_position', { place: 'Place de l\'Opéra', seconds: 900 }),
    ob('o2', 'Traiter les deux camps de la même façon : moins de vingt pour cent d\'écart dans l\'emploi de la force', 'personnalise', { target: 'ecart_de_traitement_entre_camps', max: 20 }),
    os('o3', 'Interpeller dans les deux camps sur faits', 'interpeller', { count: 4 }),
    os('o4', 'Aucune vitrine brisée', 'limiter_degats', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Partialité manifeste, filmée.'), fail('ligne_enfoncee', 'Affrontement direct de plus de trente secondes.')],
  randomEvents: ['Accusation de partialité filmée', 'Spectateurs de l\'Opéra pris entre deux foules', 'Un camp refuse la dispersion décalée', 'Panne radio de soixante secondes'],
  unique: 'La neutralité devient une statistique mesurée et affichée au compte rendu.',
  difficulty: 4, chapter: 6, tags: ['contre-manifestation', 'neutralite'],
});

/* ------------------------------------------------------------------ anciennes missions du commissaire */

/** L'écharpe : constater, annoncer, sommer dans les formes (miroirs : manifestant radical, secouriste). */
export const CDT_11 = mission({
  ...CDT,
  id: 'cdt-11-l-echarpe',
  title: 'L\'écharpe',
  pitch: 'Quatre cents personnes restent place de la République après l\'ordre de dispersion : votre écharpe tricolore et votre mégaphone vont servir.',
  briefing: [
    `La manifestation déclarée est terminée depuis une heure ; quatre cents personnes restent sur la place de la République, dont une trentaine de radicaux qui montent sur la statue et jettent des projectiles sur les fourgons. Les commerçants du boulevard du Temple baissent leurs rideaux.`,
    `Vous commandez la compagnie et vous portez l'écharpe : vous êtes seul à constater l'attroupement, à annoncer, à sommer et à ordonner. Votre mission est de vider la place dans les formes de l'article R. 211-11, avec les trois annonces et sommations, avant tout emploi de la force.`,
    `Les sections 1 et 2 font face à la statue, la section 3 tient le boulevard Voltaire, la section 4 la rue du Temple. Vous montez sur le véhicule sonorisé, vous annoncez, vous laissez une issue ouverte vers la rue du Faubourg-du-Temple. Après la dernière sommation, vous réitérez avant tout emploi d'armes. Le compte rendu note l'heure de chaque annonce.`,
    `Aucune force avant la dernière sommation, sauf violences directes contre vos agents. Quatre-vingts pour cent de la place doivent être vidés avant le premier emploi de la force. Les mots sont dans la loi : ne les inventez pas.`,
  ],
  type: 'manifestation_declaree', place: 'Place de la République', timeOfDay: 19, weather: 'nuageux', windFrom: 280, windSpeed: 3,
  crowd: crowd(400, 'pouvoir_achat', 0.45, 0.5, 0.075, { syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.3, gilets_jaunes: 0.2 },
    ['Place de la République'], 0.3),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes sur la place, dont une trentaine de radicaux près de la statue.',
    'Trente individus déterminés, masqués, avec des projectiles prélevés sur un chantier.',
    ['Place de la République', 'Boulevard du Temple', 'Boulevard Voltaire'],
    ['Faire retirer les barrières de chantier', 'Prévoir une issue ouverte', 'Tenir le journal horodaté des sommations']),
  phases: [
    ph('constat', `Constater l'attroupement`,
      `Dix-neuf heures, place de la République. La manifestation déclarée a pris fin depuis une heure et les organisateurs ont appelé à la dispersion ; quatre cents personnes sont restées, dont une trentaine qui escaladent la statue et lancent des projectiles sur les fourgons. Deux raisons de constater l'attroupement, que vous seul pouvez prononcer.`,
      T(150), [
        rad('CENTRAL', 'MISTRAL', `Les organisateurs ont annoncé la dispersion à UNE-HUIT heures. Vous seul qualifiez. La salle note l'heure de chacune de vos annonces.`),
        rad('MISTRAL 1', 'MISTRAL', `Projectiles sur mes fourgons depuis le socle de la statue, TROIS-ZÉRO individus. Le reste de la place regarde.`),
      ], [`Un fumigène éclate devant la statue`, `Un groupe monte sur la statue`]),
    ph('issues', `Trois issues à vérifier`,
      `Avant de prendre le mégaphone, il faut regarder la place de la République comme la regardera un juge : par où ces gens peuvent-ils partir ? La rue du Faubourg du Temple doit rester ouverte ; le boulevard Voltaire et la rue du Temple sont tenus par vos sections. Une sommation devant une place fermée ne vaut rien.`,
      T(120), [
        rad('MISTRAL 3', 'MISTRAL', `Je tiens le boulevard Voltaire. Dois-je laisser sortir par chez moi, ou seulement par le Faubourg du Temple ?`),
        rad('ICARE', 'MISTRAL', `Issue du Faubourg du Temple libre. Des familles et des curieux stationnent loin de la statue, côté boulevard de Magenta : ils n'entendront pas un mégaphone.`),
      ], [`Une sono de manifestants couvre le mégaphone`, `Des familles restent à l'écart sans rien entendre`]),
    ph('trois-formules', `Les trois formules, de votre voix`,
      `Vous montez sur le véhicule sonorisé, face à la statue de la République, écharpe tricolore bien visible. L'annonce, puis la première sommation, puis la dernière : mot pour mot, avec le délai entre chacune, et la fusée rouge si le bruit couvre votre voix.`,
      OBJ('o1'), [
        voix('JOURNALISTE', `Commandant, vous allez donner l'ordre de charger ? Je vous filme : vous pouvez le dire à la caméra ?`),
        rad('MISTRAL 2', 'MISTRAL', `Mes agents sont prêts. Aucun mouvement de ma part avant votre dernière sommation et votre ordre.`, 'T'),
      ], [`Un journaliste filme le commandant pendant les sommations`, `Poubelles enflammées au pied de la statue`]),
    ph('quatre-sur-cinq', `Laisser le temps de partir`,
      `Les trois formules sont dites et notées au journal. La place commence à se vider par la rue du Faubourg du Temple : les curieux d'abord, puis les familles, puis ceux qui hésitaient. Tant que quatre personnes sur cinq ne sont pas parties, chaque geste de force serait prématuré ; autour de la statue, la trentaine ne bouge pas.`,
      OBJ('o2'), [
        rad('MISTRAL 3', 'MISTRAL', `La place se vide par le Faubourg du Temple, lentement. Il reste du monde côté boulevard Voltaire.`),
        rad('MISTRAL 1', 'MISTRAL', `Les TROIS-ZÉRO de la statue redoublent de projectiles. Riposte directe possible de mon côté. Vos ordres ?`),
      ], [`Un malaise dans la foule qui se retire`, `Rumeur d'un blessé grave relayée en ligne`]),
    ph('cessation', `Faire cesser dès que le trouble cesse`,
      `Quatre personnes sur cinq ont quitté la place de la République. Reste le noyau de la statue : contre lui la force est permise, dans les moyens et la limite que vous fixez, et elle doit s'arrêter à la seconde où il se disperse. La réitération de la dernière sommation précède tout usage des lanceurs.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Journal à jour : annonce et sommations horodatées. Si vous autorisez les armes, réitérez la dernière sommation et faites collationner.`),
        rad('MISTRAL 2', 'MISTRAL', `En ligne face à la statue. Moyens et limite à votre ordre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Prononcer l\'annonce puis les deux sommations dans les formes', 'sommations_regulieres', { count: 3 }),
    ob('o2', 'Vider quatre-vingts pour cent de la place avant tout emploi de la force', 'disperser', { place: 'Place de la République' }),
    os('o3', 'Laisser une issue ouverte pendant toute l\'opération', 'proteger_site', { place: 'Rue du Faubourg du Temple' }),
    os('o4', 'Tenir le journal horodaté complet', 'personnalise', { target: 'journal_horodate' }),
  ],
  failures: [fail('bavure_grave', 'Force employée avant la dernière sommation : faute lourde.'), fail('revocation', 'Sommations omises : retrait du commandement.')],
  randomEvents: ['Le mégaphone ne couvre pas toute la place', 'Un malaise dans la foule', 'Retour de gaz par vent tournant', 'Rumeur d\'un blessé grave relayée en ligne'],
  unique: 'Le texte exact des sommations est la mission : l\'écharpe pèse autant que le bouclier.',
  difficulty: 2, chapter: 7, altRoles: ['manifestant', 'secouriste'], tags: ['sommations', 'miroir', 'echarpe'],
});

/** Dialogue d'abord : liaison avec les organisateurs. */
export const CDT_12 = mission({
  ...CDT,
  id: 'cdt-12-dialogue-d-abord',
  title: 'Dialogue d\'abord',
  pitch: 'Un cortège de cinq mille personnes veut rallier l\'Hôtel de Ville par un trajet qu\'il n\'a pas déclaré : le meilleur ordre est celui qu\'on obtient en parlant.',
  briefing: [
    `Le « Collectif Lumière Pour Tous » proteste contre la hausse des tarifs de l'énergie. Cinq mille personnes se sont réunies place du Châtelet et veulent rallier l'Hôtel de Ville par le quai. Le trajet n'est pas déclaré. Le service d'ordre du collectif a pris contact avec votre équipe de liaison.`,
    `Vous commandez la compagnie. Votre mission est d'obtenir par le dialogue un changement de parcours, d'éviter tout recours à la force sur un cortège pacifique et de ramener la manifestation dans un cadre déclaré. Vous êtes seul décideur et pouvez accorder, refuser ou différer.`,
    `La liaison négocie : quatre points de passage, une durée de vingt minutes, un arrêt du camion sono. Les sections restent en réserve rue de Rivoli, casques à la ceinture. Si un incident survient, n'utilisez la force qu'en dernier recours.`,
    `La salle vous presse d'intervenir : vous n'avez pas à lui obéir, mais chaque décision d'attendre doit être motivée au compte rendu. Le renseignement vous presse d'agir : c'est à vous de décider si l'ordre public l'exige.`,
  ],
  type: 'manifestation_declaree', place: 'Place du Châtelet', timeOfDay: 16, weather: 'clair', windFrom: 250, windSpeed: 3,
  crowd: crowd(1000, 'pouvoir_achat', 0.3, 0.4, 0.03, { syndical: 0.3, familles: 0.2, retraites: 0.15, gilets_jaunes: 0.2, etudiants: 0.15 },
    ['Place du Châtelet', 'Quai de la Mégisserie', 'Quai de Gesvres', 'Place de l\'Hôtel de Ville'], 0.4),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq mille personnes déclarées ; ambiance sérieuse, quelques tensions autour du camion sono.',
    'Aucun bloc identifié ; quelques opportunistes à surveiller.',
    ['Place du Châtelet', 'Quai de Gesvres', 'Place de l\'Hôtel de Ville'],
    ['Ouvrir la liaison dès l\'arrivée', 'Préparer un parcours de délestage', 'Garder les sections hors de vue']),
  phases: [
    ph('rencontre', `La rencontre au pied de la fontaine`,
      `Place du Châtelet, au pied de la fontaine du Palmier. Le « Collectif Lumière Pour Tous » veut rallier l'Hôtel de Ville par les quais ; rien n'est déclaré, et la rue de Rivoli est en travaux. Trois responsables du service d'ordre vous attendent, bras croisés, à côté de votre officier de liaison.`,
      T(150), [
        rad('LIAISON', 'MISTRAL', `Contact établi avec le service d'ordre. Ils demandent le quai de Gesvres jusqu'à la place de l'Hôtel de Ville. Ils sont méfiants : ils veulent vous voir en personne.`),
        voix('RESPONSABLE DU COLLECTIF', `La dernière fois, on nous a promis un parcours et on a trouvé des boucliers au bout. Qu'est-ce qui a changé ?`),
        rad('CENTRAL', 'MISTRAL', `La salle recommande un barrage quai de la Mégisserie. La décision vous appartient.`),
      ], [`Un organisateur se montre méfiant`, `Une rumeur d'interdiction circule dans la foule`]),
    ph('conditions', `Quatre points de passage, vingt minutes`,
      `La négociation tient en quatre points : le quai de la Mégisserie puis le quai de Gesvres, vingt minutes de marche, le camion sono arrêté à l'entrée de la place de l'Hôtel de Ville, la dispersion annoncée par eux. Vos sections restent rue de Rivoli, casques à la ceinture ; un élu d'arrondissement vient d'arriver et veut être sur la photo.`,
      OBJ('o1'), [
        voix('ÉLU D\'ARRONDISSEMENT', `Commandant, je me porte garant de ces gens. Laissez-les passer par la rue de Rivoli, ce sera plus simple pour tout le monde.`),
        rad('LIAISON', 'MISTRAL', `Ils acceptent le quai et les vingt minutes. Ils bloquent sur le camion sono : ils veulent le garder jusqu'au parvis.`),
      ], [`Un élu local s'invite dans la négociation`, `La salle réclame un barrage`]),
    ph('marche-negociee', `Le quai de Gesvres, au pas`,
      `L'accord est passé. Le cortège s'ébranle sur le quai de la Mégisserie, familles et retraités en tête, et longe la Seine vers le quai de Gesvres ; vos sections suivent par la rue de Rivoli, hors de vue. Au milieu de la colonne, le service d'ordre a repéré une vingtaine de perturbateurs qu'il ne connaît pas.`,
      T(240), [
        rad('LIAISON', 'MISTRAL', `Le service d'ordre signale DEUX-ZÉRO perturbateurs au milieu du cortège. Il demande à s'en occuper lui-même, et que vous restiez à distance.`),
        rad('MISTRAL 1', 'MISTRAL', `Tête de cortège sur le quai de Gesvres, calme. Je suis en parallèle rue de Rivoli, invisible depuis le quai.`),
      ], [`Un groupe se détache du cortège`, `Une rumeur en ligne gonfle la tension`]),
    ph('camion-sono', `Le camion sono à l'entrée du parvis`,
      `À l'entrée de la place de l'Hôtel de Ville, le camion sono devait s'arrêter. Son chauffeur continue d'avancer vers le parvis, poussé par la foule qui chante ; les organisateurs courent à sa hauteur. Rien de grave encore : un accord qui se fissure, et vingt minutes qui s'achèvent.`,
      FOULE('dispersion'), [
        rad('MISTRAL 2', 'MISTRAL', `Le camion sono dépasse le point convenu et avance sur le parvis. Dois-je me montrer ?`),
        voix('RESPONSABLE DU COLLECTIF', `Deux minutes, commandant ! On le fait reculer nous-mêmes. Ne sortez pas vos gars, sinon je ne tiens plus personne.`),
      ], [`Le camion sono refuse de s'arrêter`]),
    ph('annonce-conjointe', `L'annonce conjointe`,
      `Sur le parvis de l'Hôtel de Ville, la dispersion s'annonce à deux voix : la responsable du collectif au micro du camion, vous à côté d'elle, écharpe en bandoulière et mégaphone baissé. Le quai de la Mégisserie n'attend plus que votre ordre pour rouvrir.`,
      FIN, [
        voix('RESPONSABLE DU COLLECTIF', `Merci à tous ! On se disperse dans le calme, par le métro et par le pont d'Arcole. Et merci à ceux qui nous ont laissés marcher.`),
        rad('CENTRAL', 'MISTRAL', `Dispersion annoncée par les organisateurs. Rouvrez le quai de la Mégisserie dès que la chaussée est libre, et motivez vos décisions d'attente au compte rendu.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Obtenir un parcours négocié par la liaison', 'prevention', { target: 'liaison', count: 1 }),
    ob('o2', 'Éviter tout emploi de la force pendant toute la mission', 'zero_bavure'),
    os('o3', 'Garder les sections hors de vue du cortège', 'personnalise', { target: 'discretion' }),
    os('o4', 'Rouvrir le quai de la Mégisserie dans les trente minutes', 'duree', { seconds: 1800 }),
  ],
  failures: [fail('bavure_grave', 'Force employée sur un cortège pacifique.'), fail('personnalise', 'Le cortège est bloqué sans motif.')],
  randomEvents: ['Un groupe se détache du cortège', 'Un camion sono refuse de s\'arrêter', 'La salle réclame un barrage', 'Une rumeur en ligne gonfle la tension'],
  unique: 'Une mission où l\'on gagne par le téléphone : chaque minute de dialogue vaut mieux qu\'une minute de lacrymogène.',
  difficulty: 2, chapter: 7, tags: ['liaison', 'desescalade'],
});

/** Autoriser ou attendre : manifestation déclarée qui dégénère (hôtel de ville). */
export const CDT_13 = mission({
  ...CDT,
  id: 'cdt-13-autoriser-ou-attendre',
  title: 'Autoriser ou attendre',
  pitch: 'La tension monte sur le parvis de l\'Hôtel de Ville : décider vite sans décider trop tôt.',
  briefing: [
    `Un rassemblement déclaré de deux mille personnes, les « Blouses Claires », réclame des effectifs hospitaliers sur le parvis de l'Hôtel de Ville. Peu après 18 h, un groupe de casseurs se mêle à la foule, des bouteilles volent, les services de l'hôtel de ville baissent les grilles.`,
    `Vous commandez la compagnie et assumez seul toute décision. Votre mission est de maintenir le rassemblement dans son cadre, de décider si et quand employer la force, et de protéger les soignants et les familles. La salle vous presse d'intervenir ; le terrain se calme par moments.`,
    `Deux sections face au parvis, une sur la rue de Rivoli, une sur l'avenue Victoria. Le drone surveille les casseurs. Si la tension monte, vous annoncez ; si elle retombe, vous attendez. Chaque minute gagnée évite un affrontement. Chaque minute perdue peut coûter une vitrine ou un blessé.`,
    `Vous n'avez à aucun moment l'obligation de réagir à un ordre venu de la salle : c'est votre responsabilité. Gardez toujours une issue vers la rue Saint-Martin. Ne chargez pas un cortège assis.`,
  ],
  type: 'manifestation_declaree', place: 'Place de l\'Hôtel de Ville', timeOfDay: 18, weather: 'couvert', windFrom: 260, windSpeed: 4,
  crowd: crowd(1200, 'hopital', 0.35, 0.65, 0.07, { soignants: 0.5, familles: 0.15, syndical: 0.15, black_bloc: 0.07, curieux: 0.13 },
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'], 0.4),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Deux mille personnes, majorité de soignants en blouse ; ambiance revendicative.',
    'Une quarantaine d\'individus en noir arrivent par la rue de Rivoli après 18 h.',
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'],
    ['Placer la réserve rue de Rivoli', 'Préparer l\'issue rue Saint-Martin', 'Garder le drone sur le groupe noir']),
  phases: [
    ph('blouses', `Les blouses sur le parvis`,
      `Dix-huit heures, place de l'Hôtel de Ville. Les « Blouses Claires » occupent le parvis en blouse bleu pâle, banderoles tendues, et scandent « Des bras pour soigner ! » sans un geste de trop. Deux sections leur font face à distance, une tient la rue de Rivoli, une l'avenue Victoria ; rien, pour l'instant, ne justifie autre chose que d'être là.`,
      TENS(0.45), [
        rad('CENTRAL', 'MISTRAL', `Rassemblement déclaré et calme : rien ne justifie la force à cette heure. Vous seul décidez.`, 'T'),
        rad('LIAISON', 'MISTRAL', `Les organisatrices annoncent la fin du rassemblement pour UNE-NEUF heures. Elles signalent des inconnus qui tournent autour du parvis.`),
      ], [`Des inconnus tournent autour du rassemblement`]),
    ph('groupe-noir', `Quarante silhouettes dans les blouses`,
      `La tension monte : quarante individus en noir se glissent entre les soignants par la rue de Rivoli, et les premières bouteilles partent du milieu des blouses vers vos lignes. Les grilles de l'Hôtel de Ville se baissent. Depuis le parvis, vous ne voyez que soixante mètres autour de vous ; le reste, c'est l'écran du drone.`,
      T(180), [
        rad('ICARE', 'MISTRAL', `Groupe de QUATRE-ZÉRO en tenue noire, entré par la rue de Rivoli, mêlé aux soignants côté fontaine. Jets de bouteilles depuis l'intérieur du rassemblement.`),
        rad('MISTRAL 2', 'MISTRAL', `Jets de bouteilles sur ma ligne, venus du milieu des blouses. Je ne peux pas riposter sans toucher les soignants. Je demande les lanceurs.`),
      ], [`Premiers jets de bouteilles depuis le rassemblement`, `L'image du drone se fige pendant vingt secondes`]),
    ph('pressions', `La salle presse, le terrain oscille`,
      `Deux voix dans la même oreille. La salle veut une intervention avant la nuit ; le chef de la section 2, lui, veut ses lanceurs. Sur le parvis de l'Hôtel de Ville, les soignants se sont assis en chantant pour ne pas être confondus avec les lanceurs de bouteilles, et la vitrine d'une agence vient de tomber rue de Rivoli.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `La salle suggère d'intervenir maintenant. La décision reste la vôtre : motivez-la.`),
        rad('MISTRAL 2', 'MISTRAL', `Je renouvelle ma demande de lanceurs. Ça tombe dru, mes agents s'impatientent.`),
        voix('SOIGNANTE', `On s'assoit ! Regardez, on est assis ! Ce n'est pas nous qui lançons, ne tirez pas sur nous !`),
      ], [`La vitrine d'une agence est brisée rue de Rivoli`, `Les soignants s'assoient sur le parvis`, `Un chef de section insiste pour obtenir les lanceurs`]),
    ph('agent-blesse', `Un agent à terre`,
      `Un pavé atteint un agent de la section 2 à la gorge, sous le casque : il est à terre, conscient, évacué par ses collègues vers l'avenue Victoria. La demande revient, plus pressante. Séparer les quarante des soignants reste possible sans un nuage : la liaison, l'issue de la rue Saint-Martin, des interpellations désignées par le drone, ou les sommations et un refoulement limité.`,
      OBJ('o2'), [
        rad('MISTRAL 2', 'MISTRAL', `URGENT. UN agent blessé à la gorge par un pavé, conscient. Évacuation vers l'avenue Victoria. Je redemande les lanceurs.`),
        rad('LIAISON', 'MISTRAL', `Les organisatrices proposent de déplacer leur rassemblement vers la rue Saint-Martin pour vous laisser le groupe noir. Elles attendent votre réponse.`),
        rad('ICARE', 'MISTRAL', `Les QUATRE-ZÉRO restent groupés près de la fontaine. Si les blouses s'écartent, ils seront seuls sur UN-CINQ mètres.`),
      ], [`Un agent est blessé par un pavé`, `Le vent tourne vers le rassemblement`]),
    ph('decision-tracee', `La décision au journal`,
      `Le groupe noir est seul devant vos lignes. Ce que vous décidez maintenant, attendre, interpeller, sommer ou autoriser, s'écrit au journal avec l'heure, les moyens et la limite ; et ce que vous autorisez doit cesser à l'instant où ces quarante-là se dispersent. À cent mètres, rue Saint-Martin, les soignants regardent.`,
      FOULE('dispersion'), [
        rad('CENTRAL', 'MISTRAL', `Journal ouvert. Toute autorisation : moyens, limite, heure. La salle enregistre.`),
        rad('MISTRAL 1', 'MISTRAL', `Groupe noir isolé devant ma ligne, soignants hors de portée. À vos ordres.`),
      ], [`Un journaliste se plaint d'être tenu à l'écart`, `Un malaise parmi les soignants`]),
    ph('compte-des-refus', `Ce que vous n'avez pas ordonné`,
      `La place de l'Hôtel de Ville se vide : les blouses repartent vers le métro par la rue de Rivoli, les derniers lanceurs de bouteilles par les quais. Le compte rendu comptera ce que vous avez ordonné, minute par minute, et aussi ce que vous avez refusé d'ordonner.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin de rassemblement constatée. Compte rendu attendu : décisions, heures, motifs, blessés des deux côtés.`),
        rad('LIAISON', 'MISTRAL', `Les organisatrices demandent à vous dire un mot avant de partir.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Maintenir le rassemblement sans emploi de la force sur les soignants', 'zero_bavure'),
    ob('o2', 'Séparer le groupe noir des soignants', 'disperser', { place: 'Place de l\'Hôtel de Ville' }),
    os('o3', 'Limiter les vitrines brisées à trois', 'limiter_degats', { max: 3 }),
    os('o4', 'Ne laisser aucun blessé parmi les soignants', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Force employée sur les soignants.'), fail('trop_de_blesses', 'Trop de blessés.', 8)],
  randomEvents: ['La salle réclame d\'intervenir', 'Un malaise dans la foule', 'Un journaliste se plaint de l\'entrave', 'Averse soudaine'],
  unique: 'La mission se joue sur le chronomètre de la décision : agir trop tôt ou trop tard, les deux coûtent.',
  difficulty: 4, chapter: 7, tags: ['decision', 'hopital'],
});

/** Minuit sur le parvis : rassemblement spontané nocturne. */
export const CDT_14 = mission({
  ...CDT,
  id: 'cdt-14-minuit-sur-le-parvis',
  title: 'Minuit sur le parvis',
  pitch: 'À minuit, trois cents « Veilleurs » s\'installent sur le parvis de Notre-Dame sans déclaration : un rassemblement qui peut rester calme ou non.',
  briefing: [
    `Les « Veilleurs de Minuit », rassemblements nocturnes non déclarés, se retrouvent sur le parvis de Notre-Dame après l'annonce d'une décision gouvernementale. Trois cents personnes, bougies à la main, chantent doucement. Un petit groupe encagoulé s'infiltre vers minuit.`,
    `Vous commandez la compagnie. Votre mission est de garder le parvis ouvert, d'éviter tout incident près du monument et de décider seul s'il faut sommer ou laisser faire. Aucune interdiction n'est signée ; le droit de se rassembler pèse autant que l'ordre public.`,
    `Deux sections à distance sur le quai de la Corse, deux sections dans la rue de la Cité. Le drone surveille les arrivées. Vous gardez les secours et les accès au parvis. Parlez-leur avant de les sommer : ce sont des veilleurs, pas des émeutiers.`,
    `Les édifices voisins du parvis sont des sites sensibles : aucune dégradation ne sera tolérée. Un seul coup de trop sur un rassemblement silencieux serait filmé et diffusé dans l'heure.`,
  ],
  type: 'securisation', place: 'Parvis Notre-Dame - Place Jean-Paul II', timeOfDay: 23.5, weather: 'nuageux', windFrom: 200, windSpeed: 2,
  crowd: crowd(300, 'libertes', 0.3, 0.45, 0.05, { militants: 0.4, etudiants: 0.2, curieux: 0.3, black_bloc: 0.1 },
    ['Parvis Notre-Dame - Place Jean-Paul II', 'Rue de la Cité'], 0.15),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents veilleurs, bougies et chants ; une quarantaine d\'éléments encagoulés possibles.',
    'Un petit groupe de radicaux s\'insère après minuit.',
    ['Parvis Notre-Dame - Place Jean-Paul II', 'Rue de la Cité', 'Pont au Change'],
    ['Garder les secours accessibles', 'Ne pas encercler le parvis', 'Demander la liaison']),
  phases: [
    ph('veillee', `Trois cents bougies`,
      `Vingt-trois heures trente, parvis Notre-Dame. Trois cents « Veilleurs de Minuit » sont assis en cercles, une bougie à la main, et chantent à mi-voix face à la cathédrale. Aucune interdiction n'est signée ; vos sections attendent à distance, quai de la Corse et rue de la Cité, hors de la lumière.`,
      TENS(0.4), [
        rad('CENTRAL', 'MISTRAL', `Rassemblement non déclaré, aucun arrêté d'interdiction. Site sensible à proximité. Vous décidez.`, 'T'),
        rad('ICARE', 'MISTRAL', `TROIS-ZÉRO-ZÉRO personnes assises sur le parvis, calmes. Arrivées par petits groupes depuis le pont au Change et le Petit Pont.`),
      ], [`Un touriste fait voler un drone de loisir au-dessus du parvis`, `Un sans-abri dort contre une grille du parvis`]),
    ph('cagoules', `Vingt cagoules entre les cercles`,
      `Vers minuit, vingt individus encagoulés s'insèrent entre les cercles de bougies. Une poubelle prend feu contre une grille, côté rue de la Cité, et deux silhouettes escaladent une clôture pour s'approcher de la façade. Les veilleurs continuent de chanter ; certains se retournent, inquiets.`,
      T(200), [
        rad('ICARE', 'MISTRAL', `DEUX-ZÉRO individus encagoulés ont rejoint la foule par la rue de la Cité. Feu de poubelle contre une grille. Deux personnes franchissent une clôture, côté cathédrale.`),
        rad('MISTRAL 1', 'MISTRAL', `Je vois le feu depuis la rue de la Cité. Mon porte-extincteur peut y être en UNE minute, s'il traverse les veilleurs.`),
      ], [`Un feu de poubelle est allumé contre une grille`, `Deux individus escaladent une clôture près de la cathédrale`, `Des bougies sont renversées près d'une palissade`]),
    ph('parler-d-abord', `Parler avant de sommer`,
      `Ce sont des veilleurs, pas des émeutiers, et un mégaphone à minuit porte jusqu'au pont d'Arcole. Leur parler d'abord, leur montrer la rue de la Cité pour partir, puis aller chercher les auteurs désignés par le drone sans marcher sur les bougies : la moindre bousculade, sur ce parvis, sera filmée et diffusée dans l'heure.`,
      OBJ('o2'), [
        voix('VEILLEUSE', `Ils ne sont pas avec nous, ceux-là ! Si vous venez les chercher, ne nous marchez pas dessus : on reste assis.`),
        rad('ICARE', 'MISTRAL', `Trois auteurs identifiés : celui du feu et les deux de la clôture. Je les garde en visuel, ils restent en lisière, côté quai.`),
      ], [`Un groupe de veilleurs reste assis en chantant`, `Le bruit couvre le mégaphone : la fusée rouge s'impose`]),
    ph('pont-au-change', `Vers le pont au Change`,
      `Les auteurs désignés sont interpellés. Ce qui reste du groupe masqué quitte le parvis en courant par la rue de la Cité et le pont au Change, vers la rue de Rivoli ; les veilleurs, eux, soufflent leurs bougies une à une. La mission ne finit que lorsqu'il ne reste presque plus personne.`,
      FOULE('dispersion'), [
        rad('MISTRAL 3', 'MISTRAL', `Groupe de UN-CINQ individus masqués en fuite par le pont au Change, direction Châtelet. Je poursuis, ou je reste sur le parvis ?`),
        rad('CENTRAL', 'MISTRAL', `Une rame vient de déposer DEUX-ZÉRO-ZÉRO personnes à la station Cité. Elles montent vers le parvis.`),
      ], [`Une rame de métro déverse deux cents personnes`, `Un cortège sauvage part vers la rue de Rivoli`]),
    ph('parvis-eteint', `Les bougies éteintes`,
      `Le parvis Notre-Dame se vide par la rue de la Cité et les ponts ; il ne reste que des coulées de cire, une poubelle noircie et les projecteurs de la cathédrale. Avant de lever le dispositif, vos sections font le tour des grilles et des façades : chaque trace sera à signaler.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Rassemblement dispersé. Faites constater l'état des grilles et des façades, puis rendez compte.`),
        rad('MISTRAL 1', 'MISTRAL', `Tour du parvis en cours. Je vous rends compte de chaque dégradation relevée.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Garder le parvis libre de dégradations', 'proteger_site', { place: 'Parvis Notre-Dame - Place Jean-Paul II' }),
    ob('o2', 'Interpeller les auteurs de dégradations sur faits constatés', 'interpeller', { count: 3 }),
    os('o3', 'Ne recourir à la force qu\'après sommation', 'sommations_regulieres', { count: 3 }),
    os('o4', 'Laisser partir les veilleurs par la rue de la Cité', 'evacuer', { place: 'Rue de la Cité' }),
  ],
  failures: [fail('site_envahi', 'Le monument est dégradé.'), fail('bavure_grave', 'Force employée sur les veilleurs.')],
  randomEvents: ['Un touriste filme avec un drone', 'Bougies renversées près d\'une grille', 'Un SDF dort sur le parvis', 'Panne radio de soixante secondes'],
  unique: 'Un rassemblement silencieux où la moindre intervention se voit à des kilomètres : la nuit amplifie les gestes.',
  difficulty: 4, chapter: 7, tags: ['nuit', 'veilleurs'],
});

/** Le périmètre : sécurisation de site pour une visite. */
export const CDT_15 = mission({
  ...CDT,
  id: 'cdt-15-le-perimetre',
  title: 'Le périmètre',
  pitch: 'Un sommet à l\'Élysée, trois rues à fermer, un voisinage inquiet : tenir un périmètre sans que Paris étouffe.',
  briefing: [
    `Un sommet de chefs d'État se tient à l'Élysée. La rue du Faubourg-Saint-Honoré est fermée à la circulation. Un rassemblement déclaré de deux cents riverains inquiets se tient place Beauvau. Le renseignement signale un risque de dépassement par quelques individus.`,
    `Vous commandez la compagnie. Votre mission est de tenir un périmètre de sécurité de deux cents mètres autour du palais et du ministère de l'Intérieur, de laisser vivre le quartier, de faire passer les riverains, et d'éviter tout incident.`,
    `Section 1 rue du Faubourg-Saint-Honoré, section 2 place Beauvau, section 3 avenue Marigny, section 4 en réserve. Contrôles de pièce d'identité aux limites du périmètre. Vous laissez passer les riverains, vous bloquez les curieux. Le drone suit les arrivées par l'avenue Gabriel.`,
    `Les contrôles doivent être courtois : un riverain bloqué sans motif, c'est un reportage. Ne bloquez pas l'accès aux services de secours du quartier. Aucune interpellation sans fait.`,
  ],
  type: 'securisation', place: 'Rue du Faubourg Saint-Honoré', timeOfDay: 10, weather: 'clair', windFrom: 270, windSpeed: 3,
  crowd: crowd(300, 'libertes', 0.2, 0.35, 0.03, { riverains: 0.5, curieux: 0.3, militants: 0.2 },
    ['Place Beauvau', 'Rue du Faubourg Saint-Honoré', 'Avenue de Marigny'], 0.3),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents riverains et curieux ; ambiance ordinaire.',
    'Quelques isolés peuvent forcer un contrôle.',
    ['Place Beauvau', 'Rue du Faubourg Saint-Honoré', 'Avenue Gabriel'],
    ['Placer des agents aux limites du périmètre', 'Prévoir un couloir de secours', 'Informer les riverains']),
  phases: [
    ph('plan', `Dessiner le périmètre`,
      `Dix heures. Autour de l'Élysée et de la place Beauvau, le périmètre de deux cents mètres n'existe encore que sur votre carte : où poser les barrages, où filtrer, par où laisser entrer les riverains et sortir les ambulances. Section 1 rue du Faubourg Saint-Honoré, section 2 place Beauvau, section 3 avenue de Marigny, la quatrième en réserve.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `Périmètre à tenir de UN-ZÉRO heures à UN-DEUX heures. Arrivée des délégations à partir de UN-ZÉRO heures DEUX-ZÉRO.`, 'A'),
        rad('MISTRAL 3', 'MISTRAL', `En place avenue de Marigny. Où voulez-vous le point de filtrage des riverains ?`),
      ], [`Une livraison non annoncée se présente à un barrage`]),
    ph('delegations', `Douze voitures de délégations`,
      `Les voitures des délégations arrivent une à une par l'avenue de Marigny, escortées de motards. Aux filtrages, les riverains font la queue avec leurs justificatifs : une quittance, un badge d'immeuble, parfois rien du tout. Chaque refus sans motif fera un reportage ; chaque passage sans contrôle, une faille.`,
      OBJ('o2'), [
        rad('MISTRAL 2', 'MISTRAL', `Place Beauvau : file de riverains au filtrage. Un badge illisible, une dame sans justificatif qui dit habiter en face. Consignes ?`),
        voix('RIVERAINE', `J'habite ici depuis quarante ans, jeune homme. Il me faut un papier pour rentrer chez moi, maintenant ?`),
        rad('CENTRAL', 'MISTRAL', `Première délégation à UNE minute de l'avenue de Marigny. Aucun véhicule officiel ne doit attendre.`),
      ], [`Un badge de riverain est illisible`, `Un livreur sans autorisation tente de passer`, `Un journaliste réclame l'accès au périmètre`]),
    ph('petition', `Cinq riverains et une pétition`,
      `Place Beauvau, le rassemblement déclaré de deux cents riverains reste sur son trottoir. Cinq d'entre eux s'avancent jusqu'à la barrière avec une chemise cartonnée : ils veulent remettre une pétition à quelqu'un, n'importe qui, de l'autre côté. Rien ne vous oblige à dire oui ; rien ne vous oblige à dire non.`,
      T(240), [
        voix('PORTE-PAROLE DES RIVERAINS', `On ne demande pas à entrer. On demande que quelqu'un sorte prendre ce dossier. Cinq minutes, et on retourne sur notre trottoir.`),
        rad('LIAISON', 'MISTRAL', `Le cabinet accepte de recevoir la pétition à la barrière, si vous garantissez que la délégation ne dépasse pas CINQ personnes.`),
      ], [`Cinq manifestants demandent à remettre une pétition`, `Un colis suspect est signalé : fausse alerte`]),
    ph('avenue-gabriel', `Dix personnes par l'avenue Gabriel`,
      `Le drone suit dix personnes qui longent les jardins par l'avenue Gabriel, hors du rassemblement déclaré, et un scooter qui accélère vers le barrage de l'avenue de Marigny. Ce n'est peut-être rien ; c'est peut-être la tentative annoncée par le renseignement.`,
      T(220), [
        rad('ICARE', 'MISTRAL', `Groupe de UN-ZÉRO personnes sur l'avenue Gabriel, direction avenue de Marigny, pas de banderole. Un scooter les précède à vive allure.`),
        rad('MISTRAL 3', 'MISTRAL', `Scooter en approche rapide sur mon barrage. Il ne ralentit pas.`),
      ], [`Un scooter fonce vers un barrage`, `Un groupe tente de franchir le périmètre par l'avenue Gabriel`]),
    ph('levee', `Lever dans l'ordre inverse`,
      `Midi. Le sommet s'achève, les délégations repartent par l'avenue de Marigny et les riverains de la place Beauvau replient leurs pancartes. Le périmètre se lève dans l'ordre inverse de sa pose : les filtrages d'abord, les barrages ensuite, et la rue du Faubourg Saint-Honoré rendue aux livreurs.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin du sommet. Levez le périmètre après le départ de la dernière délégation et rendez compte : contrôles, refus, incidents.`),
        rad('MISTRAL 2', 'MISTRAL', `Place Beauvau : le rassemblement se disperse de lui-même. Je lève le filtrage à votre ordre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir le périmètre pendant toute la durée du sommet', 'proteger_site', { place: 'Rue du Faubourg Saint-Honoré', seconds: 1500 }),
    ob('o2', 'Laisser passer les riverains munis de justificatif', 'prevention', { count: 20 }),
    os('o3', 'Ne procéder à aucun contrôle abusif', 'zero_bavure'),
    os('o4', 'Garder libre l\'accès des secours', 'proteger_site', { place: 'Rue de Surène' }),
  ],
  failures: [fail('site_envahi', 'Le périmètre est franchi.'), fail('bavure_grave', 'Un riverain est molesté.')],
  randomEvents: ['Un livreur sans autorisation tente de passer', 'Un journaliste réclame l\'accès', 'Colis suspect (fausse alerte)', 'Un scooter fonce vers un barrage'],
  unique: 'La mission de sécurisation par excellence : le calme est la réussite, et on la remarque à peine.',
  difficulty: 2, chapter: 7, tags: ['perimetre', 'protocole'],
});

/** Tableau des missions du commandant, campagne « semaine de mobilisation » comprise. */
export const COMMANDANT: MissionDef[] = [
  CDT_01, CDT_02, CDT_03, CDT_04, CDT_05, CDT_06, CDT_07, CDT_08, CDT_09, CDT_10,
  CDT_11, CDT_12, CDT_13, CDT_14, CDT_15,
  ...SEMAINE,
];
