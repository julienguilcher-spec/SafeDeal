/* =====================================================================================
 * Catalogue — commandant (commandement et autorité habilitée réunis, voir BRIEF §1).
 * Les anciennes missions du « commissaire » sont ici : le commandant tient l'écharpe,
 * le mégaphone et les sommations. Ses ordres s'appliquent immédiatement.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { SEMAINE } from './semaine';
import { CDT_08, CDT_09, CDT_10, CDT_11, CDT_12, CDT_13, CDT_14, CDT_15 } from './commandant-suite';

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

export { CDT_08, CDT_09, CDT_10, CDT_11, CDT_12, CDT_13, CDT_14, CDT_15 };

/** Tableau des missions du commandant, campagne « semaine de mobilisation » comprise. */
export const COMMANDANT: MissionDef[] = [
  CDT_01, CDT_02, CDT_03, CDT_04, CDT_05, CDT_06, CDT_07, CDT_08, CDT_09, CDT_10,
  CDT_11, CDT_12, CDT_13, CDT_14, CDT_15,
  ...SEMAINE,
];
