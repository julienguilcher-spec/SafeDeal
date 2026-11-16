/* =====================================================================================
 * Catalogue — chef de groupe (brigadier-chef, groupe de six) puis chef de section (major, seize agents).
 * Le joueur commande par radio et par geste ; il doit aussi savoir arrêter les siens.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';

const GRP: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'chef_groupe', rank: 'brigadier_chef', poste: 'chef_groupe' };
const SEC: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'chef_groupe', rank: 'major', poste: 'chef_section' };

export const CG_01 = mission({
  ...GRP,
  id: 'cg-01-six-dont-moi',
  title: 'Six, dont moi',
  pitch: 'Cinq agents sous vos ordres, une marche déclarée et la responsabilité de chaque geste de votre groupe.',
  briefing: [
    `Boulevard Voltaire, marche déclarée du « Front commun des Ateliers » : mille personnes, ambiance syndicale, camion sono. Vous êtes brigadier-chef, chef du groupe 2B : cinq agents sous vos ordres, deux porte-boucliers, deux interpellateurs et un tireur habilité. Il fait gris, le vent est faible.`,
    `Votre mission est de tenir l'angle de la rue Oberkampf pendant le passage du cortège, de garder votre groupe regroupé et de rendre compte par radio à votre chef de section. Vous commandez, vous ne frappez pas : la discipline de vos cinq agents est votre seule arme.`,
    `Mise en place au coup de sifflet, deux boucliers devant, lanceur et extincteur derrière. Vous placez vos hommes, contrôlez leur matériel et rendez compte. Si le cortège dévie, vous prévenez le chef de section. À la dispersion, vous faites décompter votre groupe.`,
    `Un agent isolé, c'est un risque : ne les laissez jamais seuls. Un geste de l'un d'eux engage votre responsabilité. Faites tourner les postes pour limiter la fatigue.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Voltaire', timeOfDay: 15, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(1000, 'pouvoir_achat', 0.15, 0.25, 0.02, { syndical: 0.5, retraites: 0.15, familles: 0.15, etudiants: 0.2 },
    ['Place de la République', 'Boulevard Voltaire', 'Rue Oberkampf'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille marcheurs, ambiance syndicale sérieuse.',
    'Aucun signalement.', ['Boulevard Voltaire', 'Rue Oberkampf'],
    ['Contrôler le matériel de chaque agent', 'Faire tourner les postes', 'Rendre compte toutes les cinq minutes']),
  phases: [
    ph('reconnaissance', `Reconnaissance du carrefour`,
      `Boulevard Voltaire, à l'angle de la rue Oberkampf. Avant l'arrivée du cortège, vous faites le tour du carrefour avec vos cinq agents : la bouche du métro, la pharmacie d'angle, une porte cochère ouverte, des barrières de chantier oubliées sur le trottoir.`,
      T(120), [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Tenez l'angle de la rue Oberkampf, face est. Riposte directe seulement. Rendez compte toutes les CINQ minutes.`),
        voix('PORTE-BOUCLIER', `Chef, on se met où ? Devant la pharmacie, ou devant le métro ?`),
      ], [`Des barrières de chantier sont restées sur le trottoir`]),
    ph('filtrage', `Tenir l'angle, filtrer les riverains`,
      `Le groupe est en place : deux boucliers devant, lanceur et extincteur derrière. La tête du cortège remonte le boulevard Voltaire depuis la place de la République ; entre vos boucliers, les riverains de la rue Oberkampf veulent rentrer chez eux, sortir, livrer.`,
      T(240), [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Tête de cortège à DEUX-ZÉRO-ZÉRO mètres de votre angle. Nature : cortège déclaré. Attitude : calme. Filtrez les riverains, laissez passer.`),
        voix('LIVREUR', `J'ai une livraison urgente pour la pharmacie, des médicaments ! Je passe, ou je ne passe pas ?`),
      ], [`Un riverain en fauteuil roulant veut traverser le dispositif`, `Livraison urgente pour la pharmacie d'angle`]),
    ph('provocation', `Un de vos agents répond`,
      `Le gros du cortège défile devant votre angle du boulevard Voltaire, camion sono en tête. Un manifestant s'arrête à un mètre du plus jeune de vos agents et l'insulte posément, en le filmant ; l'agent se raidit, puis répond.`,
      T(180), [
        voix('GARDIEN', `Répète un peu, pour voir ? Chef, il me cherche, là !`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `On me signale un agent de votre groupe qui répond à un manifestant. Maîtrisez vos agents.`),
      ], [`Un agent insulté répond à une provocation`, `Un manifestant filme l'échange à un mètre`]),
    ph('queue-de-cortege', `La queue de cortège`,
      `Le camion sono a tourné dans la rue Oberkampf et la queue de cortège s'étire sur le boulevard Voltaire : retraités, familles, poussettes. Vos agents tiennent depuis longtemps sans bouger ; c'est le moment de faire tourner les postes sans dégarnir l'angle.`,
      OBJ('o1'), [
        voix('LANCEUR', `Chef, le petit a les bras qui tremblent. Je prends son bouclier ?`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Queue de cortège à hauteur de votre angle. Tenez jusqu'au dernier marcheur.`),
      ], [`Un malaise dans la queue de cortège`]),
    ph('rearticulation', `Réarticulation sur ordre de la section`,
      `Le dernier marcheur a passé l'angle et la rue Oberkampf se referme derrière le cortège. La section se réarticule : votre groupe quitte le carrefour en colonne par deux et rejoint les fourgons, boulevard Voltaire, où vous décomptez vos cinq agents un par un.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Angle libre. Rejoignez les véhicules en colonne, décomptez votre groupe et rendez compte de son état.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir l\'angle de la rue Oberkampf pendant le passage du cortège', 'tenir_position', { place: 'Rue Oberkampf', seconds: 600 }),
    ob('o2', 'Garder le groupe regroupé, aucun agent isolé plus de quinze secondes', 'personnalise', { target: 'agent_isole', seconds: 15 }),
    os('o3', 'Rendre compte toutes les cinq minutes', 'personnalise', { target: 'compte_rendu', count: 3 }),
    os('o4', 'Faire tourner les postes', 'releve', { count: 1 }),
  ],
  failures: [fail('bavure_grave', 'Un agent de votre groupe frappe un manifestant.'), fail('personnalise', 'Un agent est isolé plus de trente secondes.', 30)],
  randomEvents: ['Un agent insulté répond', 'Un touriste demande son chemin', 'Un malaise dans la foule', 'Panne radio de soixante secondes'],
  unique: 'Le premier galon de commandement : on est responsable de gestes qu\'on n\'a pas faits.',
  difficulty: 2, chapter: 3, tags: ['groupe', 'debutant'],
});

export const CG_02 = mission({
  ...GRP,
  id: 'cg-02-bond-offensif',
  title: 'Bond offensif',
  pitch: 'Trente mètres en avant, arrêt net, réalignement : un bond de ligne pour dégager la place de la Bastille, sans chercher le contact.',
  briefing: [
    `Place de la Bastille, une manifestation déclarée se termine mal : une centaine de personnes refusent de se disperser et jettent des bouteilles. Le commandant a prononcé les sommations. Votre groupe fait partie de la ligne qui doit refouler.`,
    `Votre mission est de conduire votre groupe dans un bond offensif de trente mètres, de vous arrêter au coup de sifflet, de réaligner la ligne sans rechercher le contact et de laisser une issue libre à la foule. Vous mettez en œuvre le bond : ce n'est pas une charge.`,
    `À l'ordre « Bond offensif ! », la ligne avance de trente mètres au pas puis s'arrête net. Réalignez-vous en cinq secondes. Laissez la foule se replier. Un deuxième bond peut suivre. Si un agent dépasse le sifflet, rappelez-le à voix haute.`,
    `Dépasser le sifflet de plus de deux secondes est une faute. Ne poursuivez jamais un fuyard : la ligne ne court pas derrière un individu. Gardez toujours une issue ouverte devant la foule.`,
  ],
  type: 'interpellation_ciblee', place: 'Place de la Bastille', timeOfDay: 19, weather: 'nuageux', windFrom: 270, windSpeed: 3,
  crowd: crowd(400, 'pouvoir_achat', 0.45, 0.55, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.2 },
    ['Place de la Bastille', 'Boulevard Henri IV', 'Rue Saint-Antoine'], 0.35),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes, une centaine déterminée.',
    'Une soixantaine d\'individus lancent des bouteilles depuis la colonne de Juillet.',
    ['Place de la Bastille', 'Rue Saint-Antoine'],
    ['Rester dans l\'alignement', 'S\'arrêter au sifflet', 'Laisser une issue']),
  phases: [
    ph('face-a-la-colonne', `En ligne face à la colonne de Juillet`,
      `Place de la Bastille, la manifestation déclarée est terminée depuis vingt minutes, mais une centaine de personnes restent autour de la colonne de Juillet et lancent des bouteilles. Votre groupe tient le centre de la ligne, côté boulevard Henri IV ; derrière la foule, la rue Saint-Antoine reste ouverte.`,
      T(120), [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Tenez la ligne, face à la colonne. Sommations en cours. Aucun mouvement avant mon ordre.`),
        voix('COMMANDANT', SOMMATIONS.derniere),
      ], [`Jets de bouteilles sur la ligne`]),
    ph('premier-bond', `Premier bond, trente mètres`,
      `À l'ordre, vous lancez votre groupe : trente mètres vers la colonne de Juillet, sans rechercher le contact, puis le coup de sifflet. La ligne doit s'arrêter net et se réaligner en cinq secondes ; c'est vous qui rappelez à voix haute celui qui dépasse.`,
      T(150), [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Dernière sommation faite. Emploi de la force : bonds offensifs, lacrymogènes à main. Limite : rue Saint-Antoine. Issue libre devant la foule.`, 'A'),
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement.`),
      ], [`Un agent de votre groupe dépasse le coup de sifflet`]),
    ph('issue', `L'issue de la rue Saint-Antoine`,
      `La foule recule vers le débouché de la rue Saint-Antoine, seule issue laissée libre sur la place de la Bastille. Une partie s'y engage, une autre hésite et revient ; un fuyard isolé passe à cinq mètres de votre aile gauche, et l'un de vos interpellateurs fait un pas pour le suivre.`,
      T(120), [
        voix('INTERPELLATEUR', `Chef, celui-là a lancé, je l'ai vu ! Je le prends ?`),
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Ne fermez pas la rue Saint-Antoine. On pousse vers l'issue, on ne la bouche pas.`, 'T'),
      ], [`Un fuyard passe à portée d'un agent tenté de le poursuivre`, `Un journaliste franchit la ligne`]),
    ph('second-bond', `Second bond, même distance`,
      `Ceux qui restent se regroupent au débouché de la rue de la Roquette, de l'autre côté de la place de la Bastille, et relancent des projectiles. La section repart pour un second bond de trente mètres, avec des agents essoufflés et un vent qui rabat les gaz sur la ligne.`,
      OBJ('o1'), [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Second bond, TROIS-ZÉRO mètres, axe rue de la Roquette, arrêt au sifflet.`),
        voix('LANCEUR', `Chef, le vent revient sur nous ! Masques ?`),
      ], [`Retour de gaz sur la ligne par vent tournant`, `Une ambulance demande le passage côté boulevard Henri IV`]),
    ph('cessation', `Le trouble a cessé`,
      `Deux bonds, deux réalignements. La place de la Bastille se vide par la rue Saint-Antoine et les bouches du métro ; l'emploi de la force s'arrête avec le trouble, et la ligne reste en place, visières levées.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Halte à l'emploi de la force : le trouble a cessé.`, 'T'),
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Rendez compte : état du groupe, consommation de lacrymogènes.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Exécuter deux bonds de trente mètres en ligne', 'personnalise', { target: 'bond_offensif', count: 2 }),
    ob('o2', 'Réaligner la ligne en moins de cinq secondes après chaque bond', 'personnalise', { target: 'realignement', seconds: 5 }),
    os('o3', 'Ne pas dépasser le coup de sifflet', 'zero_bavure'),
    os('o4', 'Laisser une issue libre à la foule', 'proteger_site', { place: 'Rue Saint-Antoine' }),
  ],
  failures: [fail('bavure_grave', 'Un agent poursuit un fuyard hors de la ligne.'), fail('ligne_enfoncee', 'La ligne est coupée en deux.')],
  randomEvents: ['Un agent dépasse le sifflet', 'Retour de gaz par vent tournant', 'Un journaliste franchit la ligne', 'Une ambulance demande le passage'],
  unique: 'Le bond n\'est pas une charge : la maîtrise de la ligne vaut mieux que la vitesse.',
  difficulty: 3, chapter: 3, tags: ['bond', 'ligne'],
});

export const CG_03 = mission({
  ...GRP,
  id: 'cg-03-la-vitrine',
  title: 'La vitrine',
  pitch: 'Quinze individus, une vitrine brisée, rue de la Paix : vous avez quatre-vingt-dix secondes avant la dispersion du groupe.',
  briefing: [
    `Rue de la Paix, en début de soirée, après une manifestation. Un groupe d'une quinzaine d'individus encagoulés brise la vitrine d'une bijouterie et commence un pillage. Le drone a désigné le groupe. Votre groupe, mobile, est à trois cents mètres.`,
    `Votre mission est de rejoindre le pillage en moins de quatre-vingt-dix secondes, d'interpeller les auteurs sur faits constatés et de protéger la bijouterie. Vous commandez un groupe de six : deux agents sécurisent la boutique, trois interpellent avec vous.`,
    `Arrivez en colonne par deux, débarquez à cinquante mètres. Le drone vous guide. Les interpellateurs sortent sur faits. Le lanceur reste à la couverture. Remettez les interpellés au fourgon.`,
    `Ne vous engagez pas dans une rue étroite face à un groupe nombreux. Ne poursuivez pas hors de la rue. Les interpellations doivent reposer sur des faits constatés, pas sur une impression.`,
  ],
  type: 'pillage', place: 'Rue de la Paix', timeOfDay: 20, weather: 'clair', windFrom: 240, windSpeed: 2,
  crowd: crowd(120, '', 0.6, 0.7, 0.35, { black_bloc: 0.4, curieux: 0.4, fetards: 0.2 },
    ['Place Vendôme', 'Rue de la Paix'], 0.15),
  forces: forces({ sections: 1, fourgons: 3, drone: true, bravm: 2, pompiers: 1, samu: 0 }),
  intel: intel(
    'Cent vingt personnes, une quinzaine de pilleurs organisés.',
    'Un groupe de quinze individus encagoulés, marteaux et sacs.',
    ['Rue de la Paix', 'Place Vendôme'],
    ['Arriver en moins de quatre-vingt-dix secondes', 'Laisser le drone guider', 'Interpeller sur faits constatés']),
  phases: [
    ph('alerte', `Quinze cagoules, une vitrine`,
      `Le drone vient de désigner une quinzaine d'individus encagoulés qui brisent la vitrine d'une bijouterie, rue de la Paix. Votre groupe est à trois cents mètres, côté place de l'Opéra : fourgon, colonne par deux, débarquement à cinquante mètres de l'objectif.`,
      OBJ('o1'), [
        rad('CENTRAL', 'MISTRAL 2 ALFA', `Groupe de UN-CINQ individus, vitrine brisée, rue de la Paix. Objectif désigné par ICARE. Interpellez sur fait constaté.`),
        rad('ICARE', 'MISTRAL 2 ALFA', `Ils entrent dans la boutique par la vitrine. Deux guetteurs sur le trottoir, côté place Vendôme.`),
      ], [`Un guetteur à deux-roues prévient le groupe de votre arrivée`]),
    ph('flagrant-delit', `Les mains pleines`,
      `Vous débarquez à cinquante mètres de la bijouterie de la rue de la Paix. Par la vitrine éventrée, on voit des silhouettes vider les présentoirs ; d'autres ressortent les bras chargés et s'égaillent vers la place Vendôme. Deux agents à la porte, trois avec vous : on ne saisit que ceux qu'on a vus sortir les mains pleines.`,
      OBJ('o2'), [
        voix('INTERPELLATEUR', `Chef, il y en a partout ! Lesquels on prend ?`),
        rad('ICARE', 'MISTRAL 2 ALFA', `Trois individus sortent avec des plateaux, direction place Vendôme, trottoir de droite. Je les filme.`),
      ], [`Le groupe de pilleurs se divise en deux`, `Un agent glisse sur des éclats de verre`]),
    ph('reserve', `Les employés dans la réserve`,
      `Trois auteurs sont menottés contre le fourgon. Au fond de la bijouterie de la rue de la Paix, derrière une porte blindée, deux employés se sont enfermés dans la réserve quand la vitrine a cédé ; ils ne veulent ouvrir à personne, et une odeur de brûlé monte d'un présentoir.`,
      T(150), [
        voix('EMPLOYÉE', `Qui est là ? Montrez-moi une carte sous la porte, je n'ouvre pas !`),
        rad('CENTRAL', 'MISTRAL 2 ALFA', `Deux employés réfugiés dans la réserve de la bijouterie, ils sont au téléphone avec nous. Sortez-les.`),
      ], [`Début de feu dans un présentoir`, `Un pilleur mineur est caché derrière le comptoir`]),
    ph('tenir-les-lieux', `Tenir la rue de la Paix à six`,
      `La vitrine est béante et la marchandise à portée de main. Une quarantaine de curieux et quelques cagoules revenues de la place Vendôme tournent autour de la boutique ; il faut tenir la rue de la Paix à six, sans poursuivre personne, jusqu'à l'arrivée de la section.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `La section débarque dans TROIS minutes par la place de l'Opéra. Tenez la boutique, ne poursuivez pas hors de la rue.`),
        voix('GARDIEN', `Chef, ils reviennent par le bas de la rue. On reste à la porte ?`),
      ], [`Un pavé est jeté depuis un balcon`]),
  ],
  objectives: [
    ob('o1', 'Arriver sur les lieux en moins de quatre-vingt-dix secondes', 'guider_unite', { place: 'Rue de la Paix', seconds: 90 }),
    ob('o2', 'Interpeller au moins trois auteurs sur faits constatés', 'interpeller', { count: 3 }),
    os('o3', 'Protéger la bijouterie contre un nouveau pillage', 'proteger_site', { target: 'bijouterie' }),
    os('o4', 'Ne laisser aucun agent isolé', 'personnalise', { target: 'agent_isole', max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Interpellation sans fait constaté.'), fail('personnalise', 'Arrivée après la dispersion du groupe.')],
  randomEvents: ['Un passant est pris au milieu du groupe', 'Le groupe se divise en deux', 'Un agent glisse sur un éclat de verre', 'Un jet de pavé depuis un balcon'],
  unique: 'Une course contre le temps : la rapidité d\'arrivée décide si l\'on interpelle ou si l\'on constate.',
  difficulty: 3, chapter: 3, altRoles: ['bravm'], tags: ['pillage', 'miroir'],
});

export const CG_04 = mission({
  ...GRP,
  id: 'cg-04-la-delegation',
  title: 'La délégation',
  pitch: 'Cinq représentants d\'un collectif doivent rejoindre un ministère au travers d\'un cortège : les escorter sans les exposer.',
  briefing: [
    `Rue de Grenelle, devant un ministère, un rassemblement déclaré de trois cents personnes attend l'arrivée d'une délégation du « Collectif Lumière Pour Tous ». Cinq représentants doivent être reçus par un conseiller. Ils sont à trois cents mètres, au milieu d'un cortège agité.`,
    `Vous êtes chef de groupe : vous recevez la mission d'escorter la délégation du carrefour jusqu'à la porte du ministère, sans incident, en la protégeant des provocations et des projectiles éventuels.`,
    `Deux boucliers devant, un agent sur chaque flanc, un serre-file derrière. Au centre, la délégation, et vous à sa hauteur. Avancez au pas, parlez aux délégués. Ne les touchez pas sauf nécessité. Une fois devant la porte, laissez-les entrer et tenez le seuil.`,
    `La délégation n'est pas votre prisonnière : elle est libre de ses mouvements. Ne bloquez pas les manifestants autour. L'image publique de l'escorte compte : aucun geste brusque.`,
  ],
  type: 'escorte', place: 'Rue de Grenelle', timeOfDay: 11, weather: 'clair', windFrom: 280, windSpeed: 2,
  crowd: crowd(300, 'pouvoir_achat', 0.25, 0.35, 0.02, { syndical: 0.35, retraites: 0.2, familles: 0.2, curieux: 0.25 },
    ['Rue de Grenelle', 'Rue du Bac'], 0.4),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 0, samu: 1 }),
  intel: intel(
    'Trois cents manifestants, ambiance vive mais pacifique.',
    'Aucun signalement.', ['Rue de Grenelle', 'Rue du Bac'],
    ['Placer des boucliers de chaque côté', 'Parler aux délégués', 'Garder le seuil libre']),
  phases: [
    ph('prise-en-compte', `Cinq délégués au carrefour`,
      `Au carrefour de la rue du Bac et de la rue de Grenelle, cinq délégués du « Collectif Lumière Pour Tous » vous attendent au milieu d'un cortège agité, dossiers sous le bras. Vous vous présentez et vous expliquez la marche : ils sont libres de leurs mouvements, vous n'êtes là que pour qu'ils arrivent.`,
      T(90), [
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Prenez en compte la délégation au carrefour du Bac. CINQ personnes, attendues au ministère. Escorte à pied, aucun geste brusque.`),
        voix('DÉLÉGUÉE', `On n'a rien demandé, nous. On ne veut pas arriver là-bas entre deux rangées de boucliers, vous comprenez ?`),
      ], [`Un délégué refuse de marcher derrière les boucliers`]),
    ph('losange', `La marche en losange`,
      `Deux boucliers devant, un agent sur chaque flanc, un serre-file : le losange s'engage dans la rue de Grenelle, au pas, la délégation au centre et vous à sa hauteur. Trois cents mètres de trottoirs étroits, de manifestants qui interpellent les délégués, et quelques opposants qui les attendent plus loin.`,
      OBJ('o1'), [
        voix('PORTE-BOUCLIER', `Chef, camionnette de livraison en travers, à cinquante mètres. On contourne par le trottoir ?`),
        voix('OPPOSANT', `Vendus ! Vous allez négocier quoi, là-dedans ?`),
      ], [`Une camionnette de livraison barre la rue`, `Un œuf est lancé sur la délégation`, `Un délégué s'arrête pour répondre à la presse`]),
    ph('seuil', `Le seuil du ministère`,
      `La délégation a franchi le porche du ministère, rue de Grenelle, et la porte s'est refermée sur elle. Votre groupe tient le seuil, dos au mur, face à trois cents personnes qui attendent des nouvelles et scandent de plus en plus fort.`,
      T(240), [
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Délégation reçue. Tenez le seuil pendant l'entretien, sans bloquer le trottoir.`, 'T'),
        voix('JOURNALISTE', `Carte de presse. Je peux me mettre derrière vous pour avoir la sortie ?`),
      ], [`Un mouvement de foule vient de la rue du Bac`, `Un journaliste demande à passer derrière le groupe`]),
    ph('sortie', `La sortie des délégués`,
      `La porte du ministère se rouvre et les cinq délégués reparaissent sur le trottoir de la rue de Grenelle. La foule se presse pour entendre ce qu'ils ont obtenu ; il faut leur faire de la place sans les isoler, puis les laisser rejoindre les leurs.`,
      FIN, [
        voix('DÉLÉGUÉE', `Laissez-nous leur parler. Deux minutes, et on repart avec eux.`),
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Dès que la délégation a rejoint le cortège, repli sur les véhicules, rue du Bac. Rendez compte.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Escorter la délégation jusqu\'à la porte du ministère', 'escorter', { place: 'Rue de Grenelle', count: 5 }),
    ob('o2', 'Ne laisser aucun délégué blessé', 'limiter_blesses', { max: 0 }),
    os('o3', 'Tenir le seuil jusqu\'à la fin de la réunion', 'tenir_position', { place: 'Rue de Grenelle', seconds: 300 }),
    os('o4', 'Ne porter aucun coup', 'zero_bavure'),
  ],
  failures: [fail('bavure_grave', 'Un délégué est bousculé par un agent.'), fail('personnalise', 'La délégation est bloquée.')],
  randomEvents: ['Un manifestant hostile insulte un délégué', 'Un journaliste réclame de passer', 'Un mouvement de foule sur la rue du Bac', 'Une averse soudaine'],
  unique: 'Une escorte où l\'on protège ceux qui nous critiquent : le sang-froid prime.',
  difficulty: 2, chapter: 3, tags: ['escorte', 'delegation'],
});

export const CG_05 = mission({
  ...GRP,
  id: 'cg-05-assis-par-terre',
  title: 'Assis par terre',
  pitch: 'Cent cinquante manifestants assis devant l\'Assemblée refusent de partir : l\'ordre d\'évacuer ne doit pas devenir une scène de violence.',
  briefing: [
    `Place du Palais Bourbon, un sit-in de cent cinquante personnes bloque l'entrée de l'Assemblée nationale. Les sommations ont été prononcées. Les manifestants sont assis, bras liés, et chantent. Vous êtes chef de groupe dans la section chargée de l'évacuation.`,
    `Votre mission est de faire évacuer les manifestants un par un, sans violence, sans blessure et avec les explications nécessaires. Les interpellations ne concernent que les récalcitrants qui refusent de partir après l'annonce finale.`,
    `Deux agents par personne, les mains dans le dos, jamais de clé de bras brutale. Vous parlez, vous expliquez. Les ambulances restent prêtes. Les journalistes sont autorisés à filmer à distance. Prenez un manifestant à la fois.`,
    `Un coup sur un cortège assis, filmé, est une catastrophe d'image. L'évacuation doit durer ce qu'il faut. Les personnes âgées sont d'abord invitées à partir.`,
  ],
  type: 'evacuation', place: 'Place du Palais Bourbon', timeOfDay: 14, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(150, 'libertes', 0.4, 0.3, 0.02, { militants: 0.5, climat: 0.2, etudiants: 0.2, familles: 0.1 },
    ['Place du Palais Bourbon', 'Pont de la Concorde'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cent cinquante manifestants assis, bras liés ; ambiance déterminée.',
    'Aucun radical ; quelques militants aguerris.', ['Place du Palais Bourbon', 'Rue de l\'Université'],
    ['Prévoir deux agents par personne', 'Laisser les journalistes filmer', 'Prévenir les ambulances']),
  phases: [
    ph('derniere-annonce', `La dernière annonce au mégaphone`,
      `Place du Palais Bourbon, cent cinquante personnes sont assises en rangs serrés devant la grille de l'Assemblée nationale, bras liés, et chantent. Le commandant a déjà prononcé les sommations ; il reprend le mégaphone pour dire une dernière fois par où partir : la rue de l'Université reste ouverte.`,
      T(120), [
        voix('COMMANDANT', `Vous pouvez encore quitter la place librement par la rue de l'Université. Les personnes qui resteront assises seront portées hors de la place, une par une.`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Évacuation à suivre. Une personne à la fois, deux agents par personne, sans brutalité. Les personnes âgées d'abord, à la voix.`),
      ]),
    ph('departs-volontaires', `Ceux qui se lèvent d'eux-mêmes`,
      `Une vingtaine de personnes se lèvent, surtout les plus âgées, et quittent la place du Palais Bourbon par la rue de l'Université sous les applaudissements des autres. Vous les accompagnez à la voix, sans les toucher ; ceux qui restent resserrent les rangs et croisent les bras.`,
      T(150), [
        voix('MANIFESTANTE ÂGÉE', `Je veux bien partir, jeune homme, mais je ne marche pas vite. Vous me donnez le bras ?`),
        voix('GARDIEN', `Chef, on commence par quel rang ? Ceux du bord, ou ceux du milieu ?`),
      ], [`Les manifestants restants se lient par les bras`]),
    ph('portage', `Le portage, un par un`,
      `Deux agents par personne, quatre pour les plus lourds : on saisit sous les aisselles et sous les genoux, on porte sur vingt-cinq mètres jusqu'au bord de la place, on dépose assis. À chaque portage la place entière scande, et une dizaine de journalistes filment depuis le trottoir de la rue de Bourgogne.`,
      T(300), [
        voix('GARDIEN', `Chef, celui-là s'accroche à la grille. Je tire, ou j'attends ?`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Rythme lent, c'est voulu. Vérifiez l'état de chaque personne déposée avant d'aller en chercher une autre.`),
      ], [`Un manifestant s'accroche à la grille`, `Un malaise au milieu du groupe assis`]),
    ph('noyau', `Le noyau, bras et jambes liés`,
      `Reste une quinzaine de personnes au centre de la place du Palais Bourbon, bras et jambes entremêlés, qui se laissent tomber de tout leur poids. Les séparer sans tordre un poignet demande quatre agents par personne et beaucoup de paroles ; les caméras se sont rapprochées.`,
      OBJ('o1'), [
        voix('MANIFESTANT', `On ne résiste pas, on ne vous aide pas non plus. Vous nous portez tous, jusqu'au dernier.`),
        voix('GARDIEN', `J'en ai porté douze, chef. Le prochain qui me crache dessus, je ne réponds plus de rien.`),
      ], [`Un de vos agents perd patience après le douzième portage`, `Un journaliste filme à un mètre du portage`]),
    ph('verification', `Repasser auprès de chacun`,
      `Le dernier manifestant est déposé au bord de la place du Palais Bourbon. Reste le plus long : repasser auprès de chaque personne portée, s'assurer qu'aucune ne se plaint d'une épaule ou d'un poignet, et faire relever l'agent qui n'en peut plus.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Faites le tour des personnes portées avec SANTÉ UN. Rendez compte : état des personnes, état de vos agents.`),
        voix('SECOURISTE', `Celle-ci se plaint du poignet. Elle a été portée par qui, et comment ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Évacuer les cent cinquante manifestants', 'evacuer', { place: 'Place du Palais Bourbon', count: 150 }),
    ob('o2', 'Ne causer aucune blessure', 'limiter_blesses', { max: 0 }),
    os('o3', 'Laisser filmer les journalistes à distance', 'prevention', { target: 'presse' }),
    os('o4', 'Faire évacuer les personnes âgées d\'abord', 'evacuer', { target: 'personne_agee', count: 10 }),
  ],
  failures: [fail('bavure_grave', 'Coup porté à un manifestant assis.'), fail('trop_de_blesses', 'Trop de blessés.', 3)],
  randomEvents: ['Un manifestant s\'accroche à une grille', 'Un malaise dans le groupe', 'Un journaliste filme de près', 'Un agent perd patience'],
  unique: 'La difficulté n\'est pas la violence des autres : c\'est de faire preuve de patience.',
  difficulty: 3, chapter: 3, altRoles: ['manifestant'], tags: ['sit-in', 'miroir'],
});

export const CG_06 = mission({
  ...GRP,
  id: 'cg-06-guet-apens',
  title: 'Guet-apens',
  pitch: 'La nuit, un appel à l\'aide d\'un collègue isolé : traverser trois rues sombres, une barricade et un groupe qui attend.',
  briefing: [
    `Rue du Faubourg-du-Temple, vingt-deux heures. Une patrouille isolée appelle à l'aide : deux agents, pris à partie par un groupe, sont cernés dans une cour. Votre groupe est à quatre cents mètres. Les rues sont sombres, un feu de poubelle brûle à l'angle.`,
    `Votre mission est de rejoindre les agents isolés, de les extraire et de rentrer sans perte. Vous traversez trois rues. Le groupe hostile vous attend peut-être. Vous commandez un groupe de six : prudence et vitesse.`,
    `Colonne par deux, bouclier en tête. Éclairage individuel allumé. Au premier signe de piège, arrêtez-vous et rendez compte. Les deux agents sont à l'étage d'un immeuble. Récupérez-les, repliez-vous par la rue de la Fontaine-au-Roi.`,
    `Ne vous engagez pas dans une rue sans issue. Un collègue tombé passe avant tout. Si le groupe dépasse vingt personnes, rendez compte et attendez le renfort.`,
  ],
  type: 'emeute_nocturne', place: 'Rue du Faubourg du Temple', timeOfDay: 22, weather: 'couvert', windFrom: 230, windSpeed: 3,
  crowd: crowd(200, '', 0.6, 0.75, 0.35, { black_bloc: 0.4, curieux: 0.3, fetards: 0.3 },
    ['Rue du Faubourg du Temple', 'Boulevard de la Villette'], 0.1),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 0, samu: 0 }),
  intel: intel(
    'Deux cents personnes en groupes mobiles.',
    'Une soixantaine d\'individus déterminés.', ['Rue du Faubourg du Temple', 'Rue de la Fontaine au Roi'],
    ['Avancer en colonne', 'Allumer les éclairages', 'Rendre compte à chaque rue']),
  phases: [
    ph('appel', `Deux collègues cernés`,
      `Vingt-deux heures. Une patrouille de deux agents, prise à partie rue du Faubourg du Temple, s'est réfugiée dans la cour d'un immeuble et ne peut plus en sortir. Votre groupe est à quatre cents mètres, côté place de la République ; les rues sont sombres, et un feu de poubelle éclaire seul le premier carrefour.`,
      T(45), [
        rad('CENTRAL', 'MISTRAL 2 BRAVO', `URGENT. DEUX agents isolés, cernés dans une cour, rue du Faubourg-du-Temple. Vous êtes le groupe le plus proche. Rejoignez et extrayez.`),
        voix('PATROUILLE CERNÉE', `On est dans la cour, au fond du porche, deuxième étage ! Ils sont une vingtaine en bas, ils essaient d'enfoncer la porte !`),
      ]),
    ph('rue-vide', `Une rue trop vide`,
      `Colonne par deux, bouclier en tête, lampes allumées. La première rue est franchie sans voir personne ; dans la rue du Faubourg du Temple, des conteneurs ont été tirés en travers de la chaussée et un scooter couché barre le trottoir. Trop propre pour être un hasard.`,
      T(120), [
        voix('PORTE-BOUCLIER', `Chef, ça sent le piège. Il n'y a pas un chat, et tout est en travers.`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Rendez compte à chaque rue franchie. La section embarque, elle est à QUATRE minutes de vous.`),
      ], [`Une barricade de poubelles enflammées barre la rue`, `Un lampadaire s'éteint au-dessus du groupe`]),
    ph('mortiers', `Mortiers d'artifice des deux côtés`,
      `Les premiers mortiers partent d'une porte cochère à gauche, puis d'un toit-terrasse à droite : tirs tendus, gerbes d'étincelles sur les boucliers. Une vingtaine de silhouettes sortent derrière vous pour fermer la rue du Faubourg du Temple. Avancer, tenir en attendant la section ou rompre : c'est à vous de le dire, maintenant.`,
      OBJ('o1'), [
        voix('LANCEUR', `Contact arrière, chef ! Ils nous ferment la rue !`),
        voix('RIVERAIN', `Pas par là ! Ils sont dans la cour, juste après la laverie, passez par le porche vert !`),
      ], [`Tirs de mortiers d'artifice depuis une porte cochère et un toit`, `Des bouteilles tombent d'un balcon`]),
    ph('cour', `La cour, au fond du porche`,
      `Vous y êtes : le porche vert, puis la cour, à deux pas de la rue du Faubourg du Temple. La porte de l'escalier est à moitié enfoncée ; vos deux collègues sont au deuxième étage, l'un blessé à la jambe. Il faut monter, les prendre, redescendre, et ne laisser personne seul dans l'escalier.`,
      OBJ('o2'), [
        voix('PATROUILLE CERNÉE', `On vous entend ! Deuxième étage, porte de gauche. Il ne peut pas poser le pied !`),
        rad('CENTRAL', 'MISTRAL 2 BRAVO', `La section débarque à l'angle de la rue de la Fontaine au Roi. Repliez-vous sur elle dès que vous avez vos deux agents.`),
      ], [`L'un des deux agents isolés est blessé à la jambe`, `Un agent du groupe glisse dans l'escalier`]),
    ph('repli', `Repli par la rue de la Fontaine au Roi`,
      `Vos deux collègues sont avec vous, l'un porté par deux agents. Le groupe ressort du porche en tortue et se replie par la rue de la Fontaine au Roi, où les gyrophares de la section éclairent enfin le carrefour ; personne ne court, personne ne reste derrière.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Je vous vois sortir. Passez derrière ma ligne, je couvre. Décomptez-vous.`),
        voix('GARDIEN', `Six plus deux, chef. Tout le monde est là.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rejoindre les deux agents isolés', 'guider_unite', { place: 'Rue du Faubourg du Temple' }),
    ob('o2', 'Les extraire sans perte', 'secourir', { target: 'agent_isole', count: 2 }),
    os('o3', 'Rentrer sans qu\'aucun agent de votre groupe soit blessé grave', 'limiter_blesses', { max: 1 }),
    os('o4', 'Rendre compte à chaque rue traversée', 'personnalise', { target: 'compte_rendu', count: 3 }),
  ],
  failures: [fail('personnalise', 'Un agent est abandonné.'), fail('joueur_hors_combat', 'Hors de combat.')],
  randomEvents: ['Une barricade de poubelles enflammées', 'Un éclairage tombe en panne', 'Un balcon jette des bouteilles', 'Un agent glisse'],
  unique: 'Un sauvetage de nuit : ramener tout le monde est la seule réussite.',
  difficulty: 4, chapter: 3, tags: ['nuit', 'sauvetage'],
});

export const CG_07 = mission({
  ...GRP,
  id: 'cg-07-le-chantier',
  title: 'Le chantier',
  pitch: 'Avant le cortège, un chantier plein de barrières, palettes et gravats : neutraliser ce que la foule pourrait ramasser.',
  briefing: [
    `Rue La Fayette, un chantier de ravalement est installé à l'angle d'une rue. Le cortège de quatorze heures doit y passer. Le chantier contient douze objets utilisables comme projectiles ou barricades : barrières, palettes, gravats, conteneurs.`,
    `Votre mission est de neutraliser le chantier avant l'arrivée du cortège : inventorier, coucher les barrières, cadenasser, faire enlever. Vous commandez un groupe de six. Il vous reste quarante-cinq minutes.`,
    `Faites l'inventaire en quatre minutes. Demandez au chef de chantier de retirer les objets, ou faites-les enlever par un camion. Cadenassez ce qui ne peut être enlevé. Postez un agent à l'angle jusqu'au passage du précortège.`,
    `Rien du chantier ne doit rester sur la chaussée. Tenez un registre précis des objets neutralisés. Le chef de chantier n'est pas forcément coopératif : il faut parfois improviser.`,
  ],
  type: 'manifestation_declaree', place: 'Rue La Fayette', timeOfDay: 12.75, weather: 'clair', windFrom: 280, windSpeed: 2,
  crowd: crowd(700, 'logement', 0.15, 0.5, 0.05, { militants: 0.3, riverains: 0.3, familles: 0.2, curieux: 0.2 },
    ['Rue La Fayette', 'Boulevard Haussmann'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 0, samu: 0 }),
  intel: intel(
    'Sept cents personnes attendues à 14 h ; rien à 12 h 45.',
    'Aucun signalement ; risque d\'opportunistes.', ['Rue La Fayette'],
    ['Inventorier en quatre minutes', 'Faire enlever les palettes', 'Poster un agent à l\'angle']),
  phases: [
    ph('inventaire', `Douze objets en quatre minutes`,
      `Rue La Fayette, à deux pas du boulevard Haussmann, un chantier de ravalement occupe le trottoir : échafaudage, barrières, palettes, sacs de gravats, un conteneur à verre. Le cortège de quatorze heures passera au ras des palissades ; tout ce qui se soulève à la main est un projectile ou un morceau de barricade.`,
      T(240), [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Reconnaissance du chantier rue La Fayette avant le passage du cortège. Inventaire en QUATRE minutes, puis neutralisation. Rendez compte du nombre d'objets.`),
        voix('GARDIEN', `Chef, les palettes, on les compte une par une, ou par pile ? Et la benne, elle compte ?`),
      ], [`Une benne pleine de gravats a été oubliée sur la chaussée`]),
    ph('neutralisation', `Coucher, cadenasser, faire enlever`,
      `Les barrières sont couchées et cadenassées entre elles, les palettes et les gravats partent dans la benne du chantier de la rue La Fayette. Ce qui ne peut pas bouger est signalé au chef de section ; le chef de chantier, lui, reste introuvable.`,
      OBJ('o1'), [
        voix('OUVRIER', `Le patron est parti déjeuner, je ne touche à rien sans lui. Vous avez un papier, pour enlever mes palettes ?`),
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Un camion de la voirie peut passer rue La Fayette dans UN-ZÉRO minutes pour ce que vous ne pouvez pas cadenasser. Préparez le tas.`),
      ], [`Le chef de chantier est absent`, `Un camion de livraison bloque la rue`]),
    ph('precortege', `Le précortège au ras des palissades`,
      `Dix objets sont hors d'atteinte. Le précortège remonte la rue La Fayette vers le boulevard Haussmann : deux cents personnes en avant de la banderole, qui regardent le chantier en passant. Un jeune homme attrape le premier barreau de l'échafaudage et commence à grimper.`,
      T(300), [
        rad('ICARE', 'MISTRAL 2', `Précortège à CINQ-ZÉRO-ZÉRO mètres de MISTRAL DEUX ALFA, DEUX-ZÉRO-ZÉRO personnes devant la banderole.`),
        voix('GARDIEN', `Chef, il y en a un sur l'échafaudage ! Je monte le chercher ?`),
      ], [`Un grimpeur monte sur l'échafaudage`, `Des manifestants secouent une barrière cadenassée`]),
    ph('registre', `Le registre du chantier`,
      `La queue du cortège a dépassé le chantier et la rue La Fayette se vide vers le boulevard Haussmann. Vous refaites le tour avec votre registre : ce qui a été cadenassé, ce qui a été enlevé, ce qui a disparu au passage de la foule.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA', `Bilan du chantier : objets neutralisés, objets manquants. Les unités en aval veulent savoir ce qui est parti avec la foule.`),
        voix('CHEF DE CHANTIER', `C'est vous qui avez touché à mes barrières ? Vous me signez quoi, pour les cadenas ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Neutraliser dix objets sur douze avant l\'arrivée du cortège', 'prevention', { target: 'mobilier_chantier', count: 10 }),
    ob('o2', 'Ne rien laisser du chantier sur la chaussée', 'prevention', { place: 'Rue La Fayette', target: 'objet_de_chantier', max: 0 }),
    os('o3', 'Signaler le conteneur à verre', 'reperer_signaux', { target: 'conteneur_verre', count: 1 }),
    os('o4', 'Interdire l\'accès à l\'échafaudage', 'proteger_site', { target: 'echafaudage' }),
  ],
  failures: [fail('personnalise', 'Plus de cinq objets sont pris par la foule.')],
  randomEvents: ['Le chef de chantier est absent', 'Une benne a été oubliée', 'Un grimpeur monte sur l\'échafaudage', 'Un camion bloque la rue'],
  unique: 'La prévention change toute la suite : moins de projectiles pour tout le quartier.',
  difficulty: 2, chapter: 3, tags: ['prevention', 'chantier'],
});

export const CG_08 = mission({
  ...GRP,
  id: 'cg-08-soir-de-derby',
  title: 'Soir de derby',
  pitch: 'Deux groupes de supporters rivaux sortent de la gare Saint-Lazare : les séparer, sans bloquer les voyageurs.',
  briefing: [
    `Cour de Rome, devant la gare Saint-Lazare, samedi soir. Deux cents supporters du « Racing Lutèce » et cent vingt de l'« Olympique des Ponts » arrivent par les trains de banlieue. Il pleut. Les voyageurs ordinaires, avec leurs valises, sont mêlés à la foule.`,
    `Votre mission est de maintenir trente mètres entre les deux groupes, d'escorter un groupe vers le métro par la rue Saint-Lazare, et d'empêcher toute rixe de plus de dix secondes. Vous commandez un groupe de six, appuyé par le reste de la section.`,
    `Placez votre groupe en cordon entre les deux camps. Parlez : ordres brefs. Escortez le premier groupe vers le métro. Ne laissez pas le second avancer. Interpellez les lanceurs de fumigènes sur faits constatés.`,
    `Les voyageurs ne sont pas des supporters : gardez le flux ouvert. Le premier à lancer un projectile sera interpellé. Ne chargez pas un groupe que vous pouvez éloigner par la parole.`,
  ],
  type: 'soir_de_match', place: 'Cour de Rome', timeOfDay: 19.5, weather: 'pluie', windFrom: 230, windSpeed: 4,
  crowd: crowd(320, '', 0.35, 0.6, 0.1, { supporters: 0.85, curieux: 0.15 },
    ['Cour de Rome', 'Place du Havre', 'Rue Saint-Lazare'], 0.7),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 0, samu: 1 }),
  intel: intel(
    'Trois cent vingt supporters, deux groupes rivaux.',
    'Une trentaine d\'ultras par groupe.', ['Cour de Rome', 'Place du Havre'],
    ['Placer le cordon entre les groupes', 'Escorter un groupe vers le métro', 'Garder le flux de voyageurs']),
  phases: [
    ph('premier-train', `Le train de Lutèce`,
      `Cour de Rome, devant la gare Saint-Lazare, sous la pluie. Le premier train de banlieue déverse deux cents supporters du « Racing Lutèce », écharpes bordeaux au cou, au milieu des voyageurs qui tirent leurs valises vers la place du Havre. Celui de l'« Olympique des Ponts » est annoncé avec dix minutes de retard.`,
      T(180), [
        rad('MISTRAL 3', 'MISTRAL 3 ALFA', `Premier groupe sur la cour de Rome : DEUX-ZÉRO-ZÉRO supporters, bruyants, sans incident. Placez-vous en cordon côté escaliers, laissez ouvert le flux des voyageurs.`),
        voix('VOYAGEUSE', `Pardon, je dois attraper un taxi place du Havre. On peut passer, avec les valises ?`),
      ], [`Le train du second groupe est annoncé en retard`]),
    ph('interposition', `Quinze mètres de cordon entre deux tribunes`,
      `Cent vingt supporters de l'« Olympique des Ponts », écharpes vertes, sortent à leur tour sur la cour de Rome. Votre cordon de six s'étire sur quinze mètres entre les deux camps ; trente mètres les séparent, pas un de plus, et les chants se répondent par-dessus vos casques.`,
      T(300), [
        voix('GARDIEN', `Chef, ils avancent d'un mètre à chaque chant. On recule, ou on tient ?`),
        rad('MISTRAL 3', 'MISTRAL 3 ALFA', `Tenez TROIS-ZÉRO mètres entre les deux groupes. La parole d'abord. Le premier qui lance est interpellé sur fait constaté.`),
      ], [`Un chant provocateur part du second groupe`, `Des voyageurs avec valises traversent entre les deux camps`]),
    ph('fumigene', `Le fumigène sur les voyageurs`,
      `Un fumigène bordeaux part du premier groupe et retombe au milieu des voyageurs, devant l'escalier de la cour de Rome. Une valise est renversée, une femme tousse, et côté vert on y voit le signal attendu : dix supporters se détachent en courant.`,
      T(150), [
        voix('SUPPORTER', `Les Ponts ! Les Ponts ! Venez nous chercher !`),
        rad('MISTRAL 3', 'MISTRAL 3 ALFA', `MISTRAL TROIS BRAVO vient se placer derrière vous. Séparez, ne chargez pas.`),
      ], [`Jet de fumigène sur les voyageurs`, `Dix supporters se détachent pour en découdre`]),
    ph('escorte-metro', `Escorte vers le métro, rue Saint-Lazare`,
      `Le plus sûr est de faire partir un camp : les supporters du « Racing Lutèce » sont escortés vers la bouche de métro de la rue Saint-Lazare, par la place du Havre, pendant que le reste de la section retient les verts sur la cour de Rome. Vous marchez à leur hauteur, entre eux et les voyageurs.`,
      OBJ('o1'), [
        rad('MISTRAL 3', 'MISTRAL 3 ALFA', `Escortez le premier groupe jusqu'au métro par la rue Saint-Lazare. Je garde le second cour de Rome.`),
        voix('MENEUR DES SUPPORTERS', `On y va, on y va. Mais vous dites aux autres d'arrêter de chanter, sinon mes gars font demi-tour.`),
      ], [`Un supporter isolé fait demi-tour vers le second groupe`]),
    ph('second-depart', `Le départ des verts`,
      `Quinze minutes sans mêlée. Le premier groupe a disparu dans le métro ; sur la cour de Rome, les supporters de l'« Olympique des Ponts » repartent à leur tour vers leurs quais, encadrés par la section, et les voyageurs reprennent possession de l'escalier.`,
      FIN, [
        rad('MISTRAL 3', 'MISTRAL 3 ALFA', `Second groupe en route vers les quais. Restez cour de Rome jusqu'au départ de leur train, puis rendez compte.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Maintenir trente mètres entre les groupes', 'tenir_position', { place: 'Cour de Rome', seconds: 900 }),
    ob('o2', 'Empêcher toute rixe de plus de dix secondes', 'limiter_blesses', { max: 3 }),
    os('o3', 'Interpeller un lanceur de fumigène', 'interpeller', { count: 1 }),
    os('o4', 'Ne jamais couper le flux des voyageurs', 'proteger_site', { place: 'Place du Havre' }),
  ],
  failures: [fail('ligne_enfoncee', 'Mêlée générale.'), fail('trop_de_blesses', 'Un voyageur est blessé.', 1)],
  randomEvents: ['Voyageurs avec valises au milieu', 'Chant provocateur', 'Train du second groupe en retard', 'Un fumigène sur le quai'],
  unique: 'Deux foules face à face et un public étranger au conflit, dans un lieu de passage.',
  difficulty: 3, chapter: 3, tags: ['match', 'supporters'],
});

export const CG_09 = mission({
  ...GRP,
  id: 'cg-09-angle-mort',
  title: 'Angle mort',
  pitch: 'Tenir un angle de rue pendant qu\'un groupe mobile tourne par les arcades : un agent isolé est un agent perdu.',
  briefing: [
    `Carrefour de la rue de Rivoli et de la rue du Louvre. Un cortège sauvage remonte la rue de Rivoli. Votre groupe tient l'angle ; un deuxième groupe, mobile, tourne autour par les arcades pour prendre le cortège à revers. Le tout se joue en vingt minutes.`,
    `Votre mission est de tenir l'angle de la rue du Louvre pendant que le groupe mobile exécute son mouvement, sans qu'aucun agent soit isolé plus de quinze secondes. Vous êtes la pierre sur laquelle tourne la manœuvre.`,
    `Placez vos boucliers à l'angle. Gardez le contact radio avec le groupe mobile. Au signal, vous resserrez. Si un agent est coupé, vous le récupérez. À la fin, vous vous regroupez avec le second groupe.`,
    `Les arcades sont des pièges : n'y engagez pas de bouclier lourd seul. Le cortège sauvage n'est pas un ennemi à écraser : il faut le canaliser.`,
  ],
  type: 'interpellation_ciblee', place: 'Rue du Louvre', timeOfDay: 18.5, weather: 'nuageux', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, '', 0.5, 0.6, 0.2, { black_bloc: 0.25, curieux: 0.35, militants: 0.2, fetards: 0.2 },
    ['Rue de Rivoli', 'Rue du Louvre'], 0.25),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes en cortège sauvage.',
    'Quatre-vingts individus déterminés.', ['Rue de Rivoli', 'Rue du Louvre'],
    ['Tenir l\'angle', 'Garder le contact radio', 'Récupérer tout agent coupé']),
  phases: [
    ph('pivot', `Le pivot de la manœuvre`,
      `Carrefour de la rue de Rivoli et de la rue du Louvre. Un cortège sauvage remonte la rue de Rivoli depuis le Châtelet ; votre groupe verrouille l'angle de la rue du Louvre pendant que le groupe Alfa file par les arcades pour le prendre à revers. Vous ne bougez pas : c'est sur vous que tout tourne.`,
      T(100), [
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Tenez l'angle de la rue du Louvre. MISTRAL DEUX ALFA contourne par les arcades. Vous êtes le pivot : gardez le contact radio avec lui.`),
        rad('MISTRAL 2 ALFA', 'MISTRAL 2 BRAVO', `Je pars par les arcades, côté Louvre. Je vous annonce ma progression.`, 'T'),
      ]),
    ph('contournement', `Alfa hors de vue`,
      `Le cortège sauvage arrive à cinquante mètres de vos boucliers et ralentit en vous voyant. Sous les arcades de la rue de Rivoli, le groupe Alfa progresse hors de vue ; sa voix à la radio est tout ce qui vous dit où il est, et elle se hache à chaque pilier.`,
      T(200), [
        rad('MISTRAL 2 ALFA', 'MISTRAL 2 BRAVO', `À mi-chemin. Des passants plein les arcades, je ralentis. Tenez-les face à vous encore DEUX minutes.`),
        voix('PORTE-BOUCLIER', `Chef, ils nous regardent, ils cherchent par où passer. Si on recule d'un mètre, ils s'engouffrent.`),
      ], [`Panne radio de trente secondes avec le groupe mobile`, `Un groupe de familles traverse le carrefour`]),
    ph('agent-coupe', `Un casque manque à l'appel`,
      `Une bousculade éclate contre votre aile droite, à l'angle de la rue du Louvre. Quand elle retombe, il manque un casque : l'un de vos agents a été entraîné de l'autre côté du carrefour, vers la rue de l'Arbre Sec, dos à une vitrine, seul.`,
      T(120), [
        voix('AGENT ISOLÉ', `Chef ! Je suis contre la vitrine, côté pharmacie ! Ils me tournent autour !`),
        voix('LANCEUR', `On y va tous, ou j'y vais avec un bouclier ? Si on y va tous, on lâche l'angle.`),
      ], [`Un agent est séparé du groupe`, `Un journaliste se glisse sous les arcades`]),
    ph('a-revers', `Le cortège pris à revers`,
      `Le groupe Alfa débouche des arcades dans le dos du cortège sauvage, qui se retrouve entre deux lignes sur la rue de Rivoli. Des projectiles partent dans les deux sens ; il faut resserrer sur l'angle sans fermer la rue du Louvre elle-même, seule sortie laissée à ceux qui veulent partir.`,
      OBJ('o1'), [
        rad('MISTRAL 2 ALFA', 'MISTRAL 2 BRAVO', `En place derrière eux. Je pousse vers vous au pas. Laissez-leur la rue du Louvre vers le nord.`),
        rad('MISTRAL 2', 'MISTRAL 2 BRAVO', `Canalisez, n'écrasez pas : la sortie reste ouverte côté rue du Louvre.`),
      ], [`Jets de projectiles sur l'angle`]),
    ph('jonction', `La jonction des deux groupes`,
      `L'angle a tenu jusqu'au bout de la manœuvre. Le cortège sauvage s'écoule par la rue du Louvre vers les Halles, et le groupe Alfa remonte la rue de Rivoli jusqu'à vos boucliers : les deux groupes se rejoignent au carrefour et se comptent.`,
      FIN, [
        rad('MISTRAL 2', 'MISTRAL 2 ALFA ET BRAVO', `Regroupez-vous au carrefour. Décomptez vos agents et rendez compte, un groupe après l'autre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir l\'angle de la rue du Louvre pendant toute la manœuvre', 'tenir_position', { place: 'Rue du Louvre', seconds: 600 }),
    ob('o2', 'Ne laisser aucun agent isolé plus de quinze secondes', 'personnalise', { target: 'agent_isole', seconds: 15 }),
    os('o3', 'Récupérer l\'agent séparé en moins de trente secondes', 'secourir', { target: 'agent_isole', count: 1 }),
    os('o4', 'Garder le contact radio avec le groupe mobile', 'personnalise', { target: 'contact_radio' }),
  ],
  failures: [fail('personnalise', 'Un agent est capturé ou isolé plus de quinze secondes.', 15), fail('ligne_enfoncee', 'L\'angle est perdu.')],
  randomEvents: ['Un agent est séparé du groupe', 'Panne radio', 'Un journaliste dans les arcades', 'Un cortège de familles traverse le carrefour'],
  unique: 'Une manœuvre à deux groupes où l\'un est le pivot de l\'autre.',
  difficulty: 3, chapter: 3, tags: ['arcades', 'manoeuvre'],
});

export const CG_10 = mission({
  ...GRP,
  id: 'cg-10-sang-froid',
  title: 'Sang-froid',
  pitch: 'Douze minutes de jets, deux agents à bout et un geste qui va partir : arrêter les siens avant qu\'ils ne frappent.',
  briefing: [
    `Boulevard Saint-Germain, un défilé de contestation a viré à l'affrontement. Votre groupe est exposé aux jets depuis douze minutes. Deux de vos agents, épuisés et exaspérés, commencent à répondre aux insultes. Les caméras des manifestants sont tournées vers eux.`,
    `Votre mission est de tenir votre groupe en main : calmer les deux agents à bout, demander la relève, vous assurer qu'aucun geste hors cadre ne soit commis. Vous êtes le garde-fou : c'est votre responsabilité si un agent frappe.`,
    `Parlez à vos agents, par leur prénom. Faites-les reculer d'un rang. Demandez la relève par radio. Remplacez le plus nerveux. Si un coup part malgré tout, prenez l'agent à part, rendez compte à votre chef. Vous ne couvrez pas une faute.`,
    `La fatigue dégrade le jugement : un agent qui n'a ni bu ni dormi frappe plus facilement. Évitez de les mettre au contact direct. Un coup porté après maîtrise est une faute lourde pour tout le groupe.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Saint-Germain', timeOfDay: 17.5, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(600, 'education', 0.55, 0.65, 0.12, { etudiants: 0.35, lyceens: 0.15, black_bloc: 0.1, syndical: 0.2, curieux: 0.2 },
    ['Boulevard Saint-Germain', 'Boulevard Saint-Michel'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six cents personnes ; tension forte après douze minutes de jets.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard Saint-Germain', 'Rue de Rennes'],
    ['Surveiller la fatigue', 'Demander la relève tôt', 'Retenir les agents nerveux']),
  phases: [
    ph('douzieme-minute', `Douze minutes sous les jets`,
      `Boulevard Saint-Germain, face au débouché de la rue de Rennes, votre groupe encaisse des jets depuis douze minutes. Deux de vos agents, le visage fermé sous la visière, ont cessé de se parler ; en face, une dizaine de téléphones sont braqués sur eux à bout de bras.`,
      T(150), [
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Tenez. Pas d'emploi de la force sans mon ordre, riposte directe seulement. Rendez compte de l'état de vos agents.`),
        voix('GARDIEN', `Ça fait douze minutes qu'ils nous traitent de tout, chef. Douze minutes.`),
      ], [`Jets de bouteilles et d'œufs de peinture sur le groupe`]),
    ph('insultes', `Deux agents à bout`,
      `Un étudiant s'approche à deux mètres du rang, boulevard Saint-Germain, et insulte l'un de vos agents en lisant son matricule à voix haute, pour la caméra. L'agent répond. Son voisin répond plus fort. C'est à vous de leur parler, par leur prénom, et de les faire reculer d'un rang avant le geste de trop.`,
      T(150), [
        voix('GARDIEN', `Laissez-moi lui dire deux mots, chef. Juste deux mots.`),
        voix('MANIFESTANT', `Vas-y, frappe ! Tout le monde te filme, vas-y !`),
      ], [`Un agent répond aux insultes d'un manifestant`, `Une dizaine de téléphones filment le groupe`]),
    ph('baton-leve', `Un bâton se lève`,
      `Une bouteille éclate sur le casque de votre agent le plus nerveux, face à la rue de Rennes. Il sort du rang d'un pas, bâton levé, sans ordre. La relève n'est toujours pas là : il faut le rattraper, le remplacer, et arracher cette relève à la radio.`,
      OBJ('o2'), [
        voix('PORTE-BOUCLIER', `Chef, retenez-le ! Il va le frapper !`),
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Votre demande de relève est notée. Le groupe CHARLIE est engagé ailleurs, je vous le donne dès qu'il se libère. Insistez si ça ne tient plus.`),
      ], [`Un agent lève son bâton sans ordre`, `Un étudiant s'effondre devant la ligne`]),
    ph('passage', `Le groupe Charlie passe devant`,
      `Le groupe Charlie s'aligne dix mètres derrière vous sur le boulevard Saint-Germain et passe la ligne. Vos agents décrochent un par un vers les fourgons de la rue du Four ; le plus nerveux, vous le prenez à part, visière levée, loin des caméras.`,
      T(120), [
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Relève accordée. Le groupe CHARLIE passe votre ligne, récupération aux véhicules.`),
        voix('GARDIEN', `Je n'ai rien fait, chef. J'ai levé le bâton, je n'ai pas frappé. Vous allez le dire, ça ?`),
      ], [`Une vidéo du bâton levé circule déjà en ligne`]),
    ph('compte-rendu', `Ce que vous direz au chef de section`,
      `Aux fourgons, à l'écart du boulevard Saint-Germain, le chef de section attend votre compte rendu. Ce qui s'est passé dans votre groupe pendant ces quinze minutes, vous êtes le seul à pouvoir le dire en entier : les insultes, les nerfs, le bâton levé.`,
      FIN, [
        rad('MISTRAL 3', 'MISTRAL 3 BRAVO', `Rejoignez-moi au véhicule de tête. Je veux votre compte rendu complet avant celui des caméras.`),
        voix('CHEF DE SECTION', `Je ne vous demande pas si ça s'est bien passé. Je vous demande ce qui s'est passé.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Empêcher tout geste hors cadre dans le groupe', 'zero_bavure'),
    ob('o2', 'Obtenir la relève avant la quinzième minute', 'releve', { count: 1, seconds: 900 }),
    os('o3', 'Remplacer l\'agent le plus nerveux', 'personnalise', { target: 'agent_nerveux', count: 1 }),
    os('o4', 'Rendre compte honnêtement à la fin', 'personnalise', { target: 'compte_rendu_sincere' }),
  ],
  failures: [fail('bavure_grave', 'Un agent de votre groupe frappe un manifestant filmé.'), fail('joueur_hors_combat', 'Hors de combat.')],
  randomEvents: ['Un agent lève son bâton sans ordre', 'Vidéo virale d\'un geste', 'Un journaliste insiste', 'Un étudiant s\'effondre'],
  unique: 'Le héros de la mission n\'est pas celui qui tient, c\'est celui qui retient.',
  difficulty: 3, chapter: 3, altRoles: [], tags: ['sang-froid', 'discipline'],
});

export const CG_11 = mission({
  ...SEC,
  id: 'cg-11-le-flanc',
  title: 'Le flanc',
  pitch: 'Un cortège sauvage arrive par la rue latérale pendant un refoulement : articuler les trois groupes sans rompre la section.',
  briefing: [
    `Boulevard de Sébastopol, pendant un refoulement par vagues de cinquante mètres. Une section de seize agents, trois groupes. Un cortège sauvage de deux cents personnes débouche par la rue Réaumur sur le flanc de votre section.`,
    `Vous êtes major, chef de section. Votre mission est de réarticuler vos trois groupes pour faire face au nouveau front sans rompre la ligne principale. Aucune coupure de la section en deux : la cohérence prime.`,
    `Le groupe A pivote à quatre-vingt-dix degrés sur l'angle. Le groupe B tient la ligne principale. Le groupe C, en réserve, se place au centre. Vous restez en retrait avec la radio. Au signal, reprenez le refoulement.`,
    `Une section coupée en deux est une section perdue. Ne dégarnissez pas la ligne principale. Gardez une issue libre pour le cortège sauvage.`,
  ],
  type: 'manifestation_interdite', place: 'Boulevard de Sébastopol', timeOfDay: 18, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(700, 'libertes', 0.5, 0.65, 0.15, { gilets_jaunes: 0.3, black_bloc: 0.15, etudiants: 0.2, curieux: 0.35 },
    ['Boulevard de Sébastopol', 'Rue Réaumur'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Sept cents personnes ; un cortège sauvage de deux cents personnes arrive sur le flanc.',
    'Une quarantaine d\'individus déterminés dans le cortège sauvage.', ['Rue Réaumur', 'Boulevard de Sébastopol'],
    ['Pivoter le groupe A', 'Garder le groupe B en ligne', 'Placer le groupe C en réserve']),
  phases: [
    ph('vagues', `Par vagues de cinquante mètres`,
      `Boulevard de Sébastopol, votre section avance en ligne, par vagues de cinquante mètres, derrière un attroupement qui recule vers le Châtelet. Groupe A à gauche, groupe B à droite, groupe C en réserve avec vous, dix mètres derrière ; dans trente mètres, le carrefour de la rue Réaumur s'ouvrira sur votre flanc.`,
      T(180), [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Refoulement, axe boulevard de Sébastopol, par bonds de CINQ-ZÉRO mètres. Issue libre devant la foule.`, 'T'),
        rad('MISTRAL 1 ALFA', 'MISTRAL 1', `Vague exécutée, groupe réaligné. Le carrefour Réaumur est à TROIS-ZÉRO mètres sur ma gauche, rien en vue.`),
      ], [`Retour de gaz sur la ligne`]),
    ph('debouche', `Deux cents personnes par la rue Réaumur`,
      `Le drone les voit avant vous : un cortège sauvage de deux cents personnes remonte la rue Réaumur au pas de course et va déboucher sur le flanc gauche de la section, à hauteur du groupe A. Si la section continue d'avancer, elle sera prise de côté ; si elle s'arrête sans ordre, la ligne du boulevard se disloque.`,
      T(120), [
        rad('ICARE', 'MISTRAL 1', `DEUX-ZÉRO-ZÉRO personnes par la rue Réaumur, direction votre flanc gauche, contact dans UNE minute. Visages couverts en tête.`),
        rad('MISTRAL 1 ALFA', 'MISTRAL 1', `Je les entends arriver sur ma gauche. Je pivote, ou je tiens la ligne ?`),
      ], [`Jets de projectiles sur le flanc gauche`]),
    ph('equerre', `La section en équerre`,
      `Le groupe A doit pivoter à quatre-vingt-dix degrés sur l'angle de la rue Réaumur, le groupe B tenir seul la ligne du boulevard de Sébastopol, le groupe C venir boucher la charnière. Vous êtes en retrait avec la radio : trois ordres courts, dans le bon ordre, et la section tient en équerre au lieu de se couper en deux.`,
      OBJ('o1'), [
        rad('MISTRAL 1 BRAVO', 'MISTRAL 1', `Je tiens seul la ligne du boulevard. Il me manque DEUX boucliers sur l'aile gauche.`),
        rad('CENTRAL', 'MISTRAL 1', `Poursuivez le refoulement vers le Châtelet sans vous arrêter.`),
      ], [`Ordre contradictoire de la salle`, `Panne radio de soixante secondes`, `Un agent du groupe A est séparé au pivot`]),
    ph('issue', `Une issue pour le cortège sauvage`,
      `La section tient en équerre. Le cortège sauvage bute sur les boucliers du groupe A et tourne sur lui-même au carrefour ; s'il n'a nulle part où aller, il poussera. Il faut lui laisser une issue : la rue Réaumur, par où il est venu, reste ouverte derrière lui.`,
      T(150), [
        rad('MISTRAL', 'MISTRAL 1', `Tenez le flanc. MISTRAL DEUX arrive à votre gauche pour reprendre l'angle Réaumur. Laissez une issue au cortège sauvage.`),
        rad('MISTRAL 1 ALFA', 'MISTRAL 1', `Ils poussent sur mes boucliers, sans coups. Si on leur montre par où partir, ils partiront.`),
      ], [`Une partie du cortège sauvage s'assoit sur la chaussée`]),
    ph('reprise', `La vague suivante`,
      `MISTRAL DEUX reprend l'angle de la rue Réaumur et votre groupe A revient s'aligner sur le boulevard de Sébastopol. La section est de nouveau d'un seul tenant : trois groupes, une ligne, et l'ordre de repartir pour la vague suivante.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 1', `Angle repris par MISTRAL DEUX. Réalignez et reprenez le refoulement sur mon ordre. Décomptez vos groupes.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Réarticuler la section sans la rompre', 'tenir_position', { place: 'Boulevard de Sébastopol', seconds: 600 }),
    ob('o2', 'Tenir le flanc contre le cortège sauvage', 'proteger_site', { place: 'Rue Réaumur' }),
    os('o3', 'Garder une issue libre au cortège sauvage', 'proteger_site', { target: 'issue' }),
    os('o4', 'Ne laisser aucun agent isolé', 'personnalise', { target: 'agent_isole', max: 0 }),
  ],
  failures: [fail('ligne_enfoncee', 'La section est coupée en deux.'), fail('trop_de_blesses', 'Trop de blessés.', 5)],
  randomEvents: ['Panne radio de soixante secondes', 'Un agent est séparé', 'Retour de gaz', 'Ordre contradictoire de la salle'],
  unique: 'Commander seize agents sous pression : la tactique se joue sur la radio autant que sur le terrain.',
  difficulty: 4, chapter: 4, tags: ['section', 'flanc'],
});

export const CG_12 = mission({
  ...SEC,
  id: 'cg-12-fiches-justes',
  title: 'Fiches justes',
  pitch: 'Cinq interpellations, cinq fiches complètes remises en huit minutes : la procédure est la moitié du métier.',
  briefing: [
    `Place du Châtelet, une manifestation s'est conclue par des heurts. Cinq individus ont été interpellés sur faits constatés pendant la dernière demi-heure. Votre section de seize doit remettre au car des officiers de police judiciaire cinq fiches complètes avant leur départ.`,
    `Vous êtes major, chef de section. Votre mission est de rassembler cinq interpellés, de vérifier les faits, de remplir cinq fiches justes et de les remettre en moins de huit minutes. Une procédure mal faite est une procédure perdue.`,
    `Chaque fiche : identité, heure, lieu, faits, témoins, agents interpellateurs. Vérifiez auprès de chaque agent. Corrigez les erreurs. Remettez-les au car. Ne laissez aucun interpellé sans surveillance. Tenez les registres à jour.`,
    `Une fiche fausse est un faux en écriture publique. Un agent qui ne se souvient plus d'un fait doit le dire. Le journal radio horodaté est la référence.`,
  ],
  type: 'interpellation_ciblee', place: 'Place du Châtelet', timeOfDay: 19.5, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(100, '', 0.2, 0.2, 0.05, { curieux: 0.7, militants: 0.3 }, ['Place du Châtelet'], 0.3),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 0, samu: 1 }),
  intel: intel(
    'Cent personnes, cinq interpellés.',
    'Aucun signalement.', ['Place du Châtelet', 'Quai de la Mégisserie'],
    ['Vérifier chaque fait', 'Corriger les fiches', 'Garder les interpellés sous surveillance']),
  phases: [
    ph('cinq-fiches', `Cinq fiches, huit minutes`,
      `Place du Châtelet, les cinq personnes interpellées pendant la dernière demi-heure sont assises, menottées, le long d'un fourgon, gardées par deux agents. Le car des officiers de police judiciaire, garé quai de la Mégisserie, repart dans huit minutes : il lui faut cinq fiches complètes, une par interpellé.`,
      T(80), [
        rad('CENTRAL', 'MISTRAL 1', `Le car des officiers de police judiciaire quitte le quai de la Mégisserie dans HUIT minutes. CINQ personnes à lui remettre, avec CINQ fiches.`),
        voix('OFFICIER DE POLICE JUDICIAIRE', `Identité, heure, lieu, faits, témoins, agents interpellateurs. Ce qui manque, je ne le prends pas.`),
      ], [`Un interpellé demande à voir un médecin`]),
    ph('agents', `Qui a vu quoi`,
      `Derrière le fourgon, place du Châtelet, vous prenez les agents interpellateurs un par un, à l'écart. L'un récite sans hésiter ; un autre a noté l'heure sur son gant ; un troisième ne sait plus s'il a vu partir le projectile ou seulement entendu le verre.`,
      T(150), [
        voix('INTERPELLATEUR', `Le jet, je l'ai vu… enfin, j'ai vu le bras. C'est pareil, non ? Mettez que je l'ai vu.`),
        voix('GARDIEN', `Moi, c'était dix-neuf heures dix. Ou dix-neuf heures vingt. Avant les gaz, en tout cas.`),
      ], [`Un agent ne se souvient plus de l'heure de son interpellation`, `Un agent corrige de lui-même sa déclaration`]),
    ph('journal-radio', `Le journal radio fait foi`,
      `Sur le capot du fourgon, place du Châtelet, les cinq fiches se remplissent ligne à ligne. Le journal radio horodaté est la seule référence : chaque heure, chaque lieu se recoupe avec lui, et ce qu'un agent n'a pas vu s'écrit « non constaté », pas autrement.`,
      OBJ('o1'), [
        rad('CENTRAL', 'MISTRAL 1', `Journal radio, interpellations signalées : UNE-NEUF heures ZÉRO-HUIT, UNE-NEUF heures UN-DEUX, UNE-NEUF heures UN-NEUF, UNE-NEUF heures DEUX-TROIS, UNE-NEUF heures DEUX-SIX.`, 'T'),
        voix('JOURNALISTE', `Vous pouvez me donner les noms ? Juste les prénoms et les âges, pour le papier de ce soir.`),
      ], [`Une fiche est contredite par le journal radio`, `Un journaliste réclame les noms des interpellés`]),
    ph('car', `La remise au car, quai de la Mégisserie`,
      `Cinq fiches relues et signées. Il reste à conduire les interpellés jusqu'au car, quai de la Mégisserie, à cinquante mètres de la place du Châtelet, sans en perdre un de vue, et à remettre le tout avant que le moteur ne démarre.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL 1', `Le car vous attend encore, moteur en marche. Présentez les interpellés un par un.`),
        voix('OFFICIER DE POLICE JUDICIAIRE', `Je compare avec le journal radio devant vous. Si une heure ne colle pas, la procédure reste sur le trottoir.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Remplir cinq fiches complètes et justes', 'personnalise', { target: 'fiche_interpellation', count: 5 }),
    ob('o2', 'Remettre les fiches en moins de huit minutes', 'duree', { seconds: 480 }),
    os('o3', 'Ne laisser aucune fiche contredite par le journal radio', 'personnalise', { target: 'fiche_contredite', max: 0 }),
    os('o4', 'Garder les cinq interpellés sous surveillance', 'proteger_site', { target: 'interpelles' }),
  ],
  failures: [fail('bavure_grave', 'Trois procédures classées pour vice de forme.'), fail('temps', 'Remise en retard.', 480)],
  randomEvents: ['Un agent ne se souvient plus de l\'heure', 'Un interpellé demande un médecin', 'Un journaliste réclame les noms', 'Le car est en retard'],
  unique: 'La paperasse est la mission : la justice juge des fiches avant de juger les faits.',
  difficulty: 2, chapter: 4, tags: ['procedure', 'section'],
});

export const CHEF_GROUPE: MissionDef[] = [
  CG_01, CG_02, CG_03, CG_04, CG_05, CG_06, CG_07, CG_08, CG_09, CG_10, CG_11, CG_12,
];
