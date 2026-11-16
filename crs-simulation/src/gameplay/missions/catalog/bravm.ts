/* =====================================================================================
 * Catalogue — BRAV-M : binôme à moto (pilote et passager), mobilité, flagrant délit.
 * Détachement facultatif de la carrière (chapitre 9) ; indicatifs « FAUCON ».
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, scene, T, TENS, voix } from './dsl';
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
    ph('mise-en-route', `Six motos devant les Invalides`,
      `Esplanade des Invalides, six motos alignées face au dôme, moteurs tournants. Vous êtes pilote ; votre passager s'installe, mains sur les poignées de maintien. Le moniteur donne la règle avant le premier tour de roue : la moto sert à se placer, jamais à intervenir en roulant.`,
      T(30), [
        voix('MONITEUR', `Casque attaché, feux allumés, colonne par deux. La moto vous amène, c'est tout : on n'intervient jamais en roulant.`),
        rad('FAUCON 1', 'FAUCON 2', `Colonne par deux derrière moi, départ. Deux longueurs de moto entre chaque binôme.`),
      ]),
    ph('cones', `Douze cônes à trente à l'heure`,
      `Le parcours serpente entre douze cônes posés sur le sable de l'esplanade des Invalides, à trente kilomètres-heure. Vous suivez la moto de tête à deux longueurs, sans à-coup : derrière vous, un passager qui ne tient que par vos trajectoires.`,
      OBJ('o1'), [
        voix('MONITEUR', `Regardez la sortie du virage, pas le cône. Et laissez deux motos devant vous, pas une et demie.`),
        voix('PASSAGER', `Doucement sur le frein avant, je pars en avant à chaque fois.`),
      ], [`Un cône est renversé par la moto qui vous précède`, `Le moniteur change le parcours au dernier moment`]),
    ph('pied-a-terre', `Pied à terre en cinq secondes`,
      `Douze cônes passés. La colonne s'arrête en ligne à quarante mètres d'un fourgon qui figure l'objectif, côté quai d'Orsay. Moteur coupé, béquille, casque gardé : tout le groupe met pied à terre en même temps, et un pilote sur trois reste aux machines.`,
      OBJ('o2'), [
        rad('FAUCON 1', 'FAUCON 2', `Halte en ligne, QUATRE-ZÉRO mètres de l'objectif. Pied à terre ensemble, à mon signal.`),
        voix('MONITEUR', `Cinq secondes, tous ensemble ! Celui qui garde les motos ne regarde pas l'objectif : il regarde autour.`),
      ], [`Un piéton distrait traverse devant la colonne à l'arrêt`]),
    ph('rembarquement', `Remonter en selle, repli en colonne`,
      `Tout le groupe était à terre dans les temps. Reste le plus simple à rater : revenir aux motos sans courir, remonter passager d'abord, et repartir en colonne par deux vers le fond de l'esplanade des Invalides, dans l'ordre exact de l'arrivée.`,
      FIN, [
        voix('MONITEUR', `On remonte dans l'ordre où on est descendus. Une moto qui part seule, c'est une moto qu'on vient chercher.`),
        rad('FAUCON 1', 'FAUCON 2', `Rembarquement. Repli en colonne par deux, même intervalle.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Rouler en colonne de binômes sans renverser un seul cône', 'personnalise', { target: 'parcours_cones', count: 12 }),
    ob('o2', 'Mettre pied à terre ensemble en moins de cinq secondes', 'duree', { seconds: 5 }),
    os('o3', 'Garder en colonne un intervalle de deux longueurs de moto', 'personnalise', { target: 'distance_en_colonne', count: 2 }),
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
    `Un piéton heurté est une faute lourde. Ne dépassez jamais vingt kilomètres-heure à moins de trente mètres de piétons. Les motos sont une cible : ne les laissez pas sans garde.`,
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
    ph('direction', `Le drone donne la direction`,
      `Vingt-trois heures, boulevard Montmartre. Quatre-vingts personnes en noir remontent les Grands Boulevards vers l'ouest en étoilant des vitrines. Vos six motos suivent en colonne de binômes, cinquante mètres derrière, feux allumés : jamais plus près, jamais dans la foule.`,
      T(120), [
        rad('ICARE', 'FAUCON 1', `Groupe de HUIT-ZÉRO, tenue noire, boulevard Montmartre, direction boulevard des Italiens. Allure : pas rapide. Trois cibles probables devant eux : deux banques, une bijouterie.`),
        rad('FAUCON 1', 'FAUCON 2', `On reste à CINQ-ZÉRO mètres. Personne ne double, personne ne s'engage dans la foule.`),
      ], [`Un piéton traverse devant la colonne`]),
    ph('avance', `Prendre de l'avance par la rue du Quatre Septembre`,
      `Suivre ne suffit pas : pour protéger une cible, il faut y être avant eux. La colonne décroche par la rue Vivienne et file par la rue du Quatre Septembre, parallèle aux boulevards, pour ressortir devant le groupe. Vingt à l'heure à moins de trente mètres des piétons, pas davantage : un passant heurté, et tout s'arrête.`,
      T(150), [
        rad('FAUCON 1', 'FAUCON 2', `On décroche par la rue Vivienne, puis rue du Quatre Septembre. Objectif : être devant eux boulevard des Italiens.`),
        rad('ICARE', 'FAUCON 1', `Le groupe se scinde : SIX-ZÉRO continuent sur le boulevard des Italiens, DEUX-ZÉRO s'arrêtent devant la première banque.`),
      ], [`Le groupe se scinde en deux`, `Un cycliste arrive à contresens`, `Une terrasse pleine déborde sur la chaussée`]),
    ph('barrer', `Débarquer quatre-vingts mètres devant`,
      `Les motos ressortent sur le boulevard des Italiens, quatre-vingts mètres devant la tête du groupe, et s'arrêtent en travers. Pied à terre ensemble ; un pilote sur trois garde les machines, les autres barrent la chaussée à pied. Le groupe ralentit, hésite, cherche une rue par où contourner.`,
      OBJ('o1'), [
        rad('FAUCON 1', 'FAUCON 2', `Halte. Pied à terre, barrage à pied devant la banque. Pilotes de garde aux machines.`),
        rad('ICARE', 'FAUCON 1', `Ils vous ont vus. La tête oblique vers une rue latérale, côté sud. Trois individus allument un conteneur.`),
      ], [`Un conteneur est incendié au milieu du boulevard`, `Des bouteilles volent vers les motos`]),
    ph('incendiaires', `Trois incendiaires à trente mètres`,
      `Huit minutes de filature sans toucher un piéton. Devant la banque du boulevard des Italiens, trois individus viennent de mettre le feu à un conteneur et à une trottinette ; le drone les a filmés, ils sont à trente mètres de vous, et le reste du groupe recule vers la rue de la Paix.`,
      FOULE('dispersion'), [
        rad('ICARE', 'FAUCON 2', `Trois auteurs filmés : capuche rouge, sac kaki, veste à bandes. À TROIS-ZÉRO mètres devant vous, ils s'éloignent au pas.`),
        voix('PASSAGER', `Je prends la capuche rouge avec toi. Les deux autres, on les laisse au deuxième binôme.`),
      ], [`Une trottinette embrasée projette des étincelles`, `Une moto cale au moment de repartir`]),
    ph('compte-rendu', `Vitrine par vitrine`,
      `Le cortège sauvage se dissout dans les rues qui mènent à l'Opéra. Sur le boulevard des Italiens, le conteneur fume encore et la batterie de la trottinette crépite : un feu à signaler aux pompiers, des motos à recompter, et un compte rendu à passer, vitrine par vitrine.`,
      FIN, [
        rad('CENTRAL', 'FAUCON 1', `Rendez compte : cibles atteintes, interpellations, état des machines. SAPEUR UN est en route pour le conteneur.`),
        rad('FAUCON 1', 'FAUCON 2', `Regroupement aux motos. Chacun vérifie sa machine avant de remonter.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Suivre le groupe pendant huit minutes sans rouler dans la foule', 'guider_unite', { target: 'cortege_sauvage', seconds: 480 }),
    ob('o2', 'Empêcher l\'atteinte d\'au moins deux des trois cibles', 'proteger_site', { target: 'cible_du_cortege', count: 2 }),
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
  pitch: 'Un casseur désigné par le drone, trente secondes pour le rejoindre à pied entre les terrasses de la place de la Bourse.',
  briefing: [
    `Place de la Bourse, en fin d'après-midi. Un cortège dégénère : un individu a jeté un pavé sur un fourgon. Le drone le suit : veste verte, sac noir. Il entre dans la foule. Votre binôme est le plus proche.`,
    `Votre mission est de descendre de la moto, de rejoindre la cible en moins de trente secondes, de l'interpeller en flagrant délit et de remettre la fiche d'interpellation à l'officier de police judiciaire. Vous êtes passager : vous tenez la caméra-piéton.`,
    `Les motos s'arrêtent à cinquante mètres de la cible ; tout le groupe met pied à terre ensemble et un pilote sur trois garde les machines. Avancez par les trottoirs, jamais dans la foule dense. Identifiez-vous à voix haute. Saisissez à deux, amenez au sol sans coup, menottez. L'interpellé est conduit à pied au fourgon de la section la plus proche : personne ne monte menotté sur une moto.`,
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
    ph('signalement', `Veste verte, sac noir, baskets blanches`,
      `Place de la Bourse, un homme vient de lancer un pavé sur un fourgon avant de se fondre dans le cortège. Le drone ne l'a pas lâché ; à l'arrière de la moto, vous écoutez le signalement en serrant la caméra-piéton : la veste et le sac se changent, les chaussures rarement.`,
      T(60), [
        rad('ICARE', 'FAUCON 2', `Objectif désigné : veste verte, sac noir, baskets blanches. Auteur d'un jet de pavé sur un fourgon, fait filmé. À CENT mètres de vous, côté rue du Quatre Septembre.`),
        voix('PILOTE', `Je te pose à cinquante mètres, pas plus près. Je garde la moto, tu gardes les yeux dessus.`),
      ]),
    ph('porche', `Sous le porche, une autre veste`,
      `Les motos s'arrêtent à cinquante mètres et tout le groupe met pied à terre. La cible s'engouffre sous un porche de la rue du Quatre Septembre et en ressort dix secondes plus tard : veste grise, casquette, le sac noir retourné sur le ventre. Les baskets blanches, elles, n'ont pas changé.`,
      T(120), [
        rad('ICARE', 'FAUCON 2', `Il ressort du porche : veste grise, casquette. Même sac, mêmes chaussures. Attention : un autre homme en veste verte marche DEUX mètres devant lui.`),
        rad('ICARE', 'FAUCON 2', `Liaison instable, je vais vous perdre pendant UN-CINQ secondes.`, 'T'),
      ], [`La cible change de veste et de couvre-chef`, `Un passant en veste verte marche devant la cible`, `La liaison avec le drone est perdue quinze secondes`]),
    ph('filature', `Trente secondes sur le trottoir`,
      `Vous avancez par le trottoir de la rue du Quatre Septembre, jamais dans la foule dense, les yeux sur les baskets blanches. Trente mètres, vingt, dix. S'identifier à voix haute, saisir à deux, amener au sol sans coup, menotter : la caméra-piéton tourne depuis le pied à terre.`,
      OBJ('o1'), [
        voix('ÉQUIPIER', `C'est lui, les baskets ! Pas l'autre, pas la veste verte !`),
        rad('FAUCON 1', 'FAUCON 2', `Si vous le perdez de vue plus de UN-ZÉRO secondes, vous renoncez. Pas d'erreur de personne.`),
      ], [`Des passants s'interposent entre vous et la cible`, `Un journaliste filme de près`]),
    ph('conduite', `À pied jusqu'au fourgon, puis la fiche`,
      `L'homme est menotté sur le trottoir. Personne ne monte entravé sur une moto : il faut le conduire à pied jusqu'au fourgon de la section la plus proche, rue de Richelieu, puis remplir la fiche sur le capot : l'heure du jet, l'heure de la saisie, le fait constaté, et comment vous l'avez reconnu malgré la veste.`,
      OBJ('o2'), [
        rad('CENTRAL', 'FAUCON 2', `Conduisez l'interpellé au fourgon de MISTRAL DEUX, rue de Richelieu. Heure du jet au journal : UNE-SEPT heures ZÉRO-HUIT.`),
        voix('OFFICIER DE POLICE JUDICIAIRE', `Il n'a plus la veste du signalement. Qu'est-ce qui vous permet de dire que c'est le même homme ?`),
      ], [`Des manifestants suivent l'interpellé en protestant`]),
    ph('retour-aux-machines', `Retour aux machines`,
      `La fiche est remise et l'homme est entre les mains de l'officier de police judiciaire. Place de la Bourse, votre pilote n'a pas quitté les motos, qu'une dizaine de curieux entourent en filmant ; il reste à les rejoindre sans courir, à remonter en selle et à repartir en colonne.`,
      FIN, [
        voix('PILOTE', `Dépêche-toi sans courir. Ils tournent autour des machines depuis cinq minutes.`),
        rad('FAUCON 1', 'FAUCON 2', `Rembarquement dès que vous êtes au complet. Colonne par deux, direction la Bourse.`, 'T'),
      ], [`Des curieux entourent les motos`]),
  ],
  objectives: [
    ob('o1', 'Atteindre la cible en moins de trente secondes', 'interpeller', { target: 'cible_drone', count: 1, seconds: 30 }),
    ob('o2', 'Remettre une fiche complète avec heure et fait', 'personnalise', { target: 'fiche_interpellation', count: 1 }),
    os('o3', 'Ne confondre personne', 'zero_bavure'),
    os('o4', 'Garder la moto sous surveillance', 'proteger_site', { target: 'moto' }),
  ],
  failures: [fail('personnalise', 'Mauvaise personne interpellée : procédure nulle.'), fail('bavure_grave', 'Interpellation sans fait constaté.')],
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
    ph('trajet', `Les premiers à portée`,
      `Rue de la Paix, quinze individus encagoulés vident une bijouterie par sa vitrine éventrée. Vous êtes à cent mètres, côté place Vendôme, moteur chaud ; le groupe de CRS est à trois cents mètres, à pied. Trente à l'heure au plus, les passants d'abord : il s'agit d'arriver, pas d'arriver vite.`,
      OBJ('o1'), [
        rad('CENTRAL', 'FAUCON 2', `Groupe de UN-CINQ individus, vitrine brisée, rue de la Paix. Objectif désigné par ICARE. Vous êtes les premiers à portée : fixez, n'engagez pas seuls.`),
        rad('ICARE', 'FAUCON 2', `Des employés sont restés à l'intérieur, au fond de la boutique. Deux guetteurs sur le trottoir.`),
      ], [`Un passant traverse devant la moto`, `Des trottinettes renversées barrent la rue`]),
    ph('fixer', `Fixer sans engager`,
      `Arrêt à cinquante mètres de la bijouterie de la rue de la Paix. Votre passager descend, bouclier au bras, et se montre ; vous restez en selle, la moto en travers, la radio à la main. À deux contre quinze, on ne saisit personne : on se fait voir, on décrit, on attend.`,
      T(90), [
        voix('PASSAGER', `Ils nous ont vus. Trois sortent avec des sacs, les autres restent dedans. Je ne bouge pas d'ici.`),
        rad('MISTRAL 2 ALFA', 'FAUCON 2', `À pied, à DEUX minutes de vous. Dites-moi par où ils sortent et combien ils sont.`),
      ], [`Un projectile tombe d'un étage`, `Un faux blessé s'allonge pour détourner l'attention`]),
    ph('moto', `La moto, cible facile`,
      `Trois individus se détachent du groupe et viennent vers vous par le trottoir de la rue de la Paix, une barre à la main. Ce n'est plus la bijouterie qu'ils regardent, c'est votre machine. Reculer de vingt mètres ne coûte rien ; perdre la moto coûte la mission.`,
      T(120), [
        voix('PASSAGER', `Ils viennent sur la moto ! Recule-la, je te couvre !`),
        rad('CENTRAL', 'FAUCON 2', `Une alarme vient de se déclencher dans la boutique voisine. Rendez compte : le groupe se divise ?`),
      ], [`Trois individus s'en prennent à la moto`, `Une alarme se déclenche dans la boutique voisine`, `Le groupe se divise`]),
    ph('relais', `Le relais des CRS`,
      `Le groupe de CRS débouche de la place de l'Opéra au pas de course, boucliers en avant, et prend la rue de la Paix à son compte. Votre binôme passe en couverture : la moto en travers côté place Vendôme, le drone au-dessus, et un compte rendu à passer sur ce que vous avez vu sortir, et par où.`,
      FIN, [
        rad('MISTRAL 2 ALFA', 'FAUCON 2', `Sur place. Nous prenons le relais. Restez en couverture côté place Vendôme.`, 'T'),
        rad('CENTRAL', 'FAUCON 2', `Rendez compte : nombre d'individus sortis avant l'arrivée de MISTRAL, directions de fuite.`),
      ]),
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
    `Ne faites jamais passer un fourgon sous des jets : demandez un renfort. Une batterie de trottinette en feu ne s'éteint pas à l'extincteur : n'y touchez pas, signalez-la aux pompiers. La priorité est la vie des habitants.`,
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
    ph('barricade', `Le fourgon bloqué`,
      `Boulevard Henri IV, une barricade de poubelles et de trottinettes enflammées coupe la chaussée devant un fourgon de pompiers. Deux cents mètres plus loin, vers la Bastille, un immeuble brûle et des riverains appellent aux fenêtres. Votre binôme est le seul disponible.`,
      T(60), [
        rad('SAPEUR 1', 'FAUCON 2', `Barricade en feu devant nous, boulevard Henri IV. Je ne passe pas. J'attends votre guidage par un autre itinéraire.`),
        rad('CENTRAL', 'FAUCON 2', `Feu d'immeuble, riverains aux fenêtres. Guidez SAPEUR UN, vous êtes seuls sur le secteur.`),
      ], [`Une batterie de trottinette s'embrase dans la barricade`]),
    ph('guidage', `Ouvrir la route par les rues latérales`,
      `Vous prenez la tête du fourgon, vingt mètres devant, gyrophare allumé, et vous le sortez du boulevard Henri IV par la rue de la Cerisaie, puis la rue du Petit Musc. Chaque angle se reconnaît avant d'y engager l'engin ; chaque voiture mal garée est un demi-tour impossible.`,
      OBJ('o1'), [
        voix('PASSAGER', `À gauche, c'est trop étroit pour lui. Prends la suivante.`),
        rad('SAPEUR 1', 'FAUCON 2', `Je vous suis à DEUX-ZÉRO mètres. Annoncez-moi les virages serrés avant que j'y sois.`),
      ], [`Un curieux se plante devant le fourgon pour filmer`, `Un riverain descend déplacer sa voiture`, `Jets de bouteilles sur le fourgon`]),
    ph('perimetre', `Vingt-cinq mètres autour de l'engin`,
      `Le fourgon est au pied de l'immeuble en feu, à l'angle de la rue Saint-Antoine, et les lances se déroulent. Pied à terre : il faut un périmètre de vingt-cinq mètres autour de l'engin et un couloir de trois mètres pour les tuyaux, face à une centaine de personnes dont quelques-unes cherchent des projectiles.`,
      T(180), [
        voix('SAPEUR-POMPIER', `Tenez-moi les gens loin des tuyaux ! Si on me marche dessus, je n'ai plus d'eau là-haut !`),
        rad('CENTRAL', 'FAUCON 2', `Renfort en route, QUATRE minutes. Tenez le périmètre, ne poursuivez personne.`),
      ], [`Un tuyau est piétiné par des curieux`, `Un riverain menace de sauter d'un balcon`]),
    ph('mortiers', `Mortiers sur la grande échelle`,
      `Des mortiers d'artifice partent d'un groupe posté de l'autre côté du carrefour de la rue Saint-Antoine, vers la grande échelle. Boucliers levés devant les pompiers, on ne poursuit personne : on repère les tireurs, on les décrit à la radio, et on reste la bulle qui protège ceux qui arrosent.`,
      T(150), [
        voix('PASSAGER', `Tireur à gauche, derrière l'abribus ! Capuche grise ! Je ne lâche pas le pompier.`),
        rad('SAPEUR 1', 'FAUCON 2', `Tirs sur mon échelle. Si ça continue, je replie mes hommes. Second départ de feu signalé à CENT mètres.`),
      ], [`Mortiers d'artifice tirés vers les pompiers`, `Second départ de feu à cent mètres`]),
    ph('repli-groupe', `Jusqu'au dernier tuyau roulé`,
      `Les flammes baissent aux fenêtres de l'immeuble et les riverains descendent par l'escalier, encadrés par les pompiers. Les renforts arrivent par le boulevard Henri IV ; votre binôme reste collé à l'engin jusqu'au dernier tuyau roulé, puis repart devant lui, comme il est venu.`,
      FIN, [
        rad('SAPEUR 1', 'FAUCON 2', `Je termine l'extinction. Restez avec moi jusqu'au repli, puis ouvrez-moi la route du retour.`),
        rad('CENTRAL', 'FAUCON 2', `MISTRAL TROIS arrive sur place et reprend le périmètre. Rendez compte : projectiles reçus par l'engin, tireurs repérés.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Guider le fourgon jusqu\'à l\'immeuble en feu', 'escorter', { place: 'Boulevard Henri IV', target: 'pompiers' }),
    ob('o2', 'Tenir un couloir de trois mètres jusqu\'à la fin de l\'extinction', 'proteger_site', { target: 'couloir_secours', seconds: 600 }),
    os('o3', 'Ne laisser aucun projectile atteindre l\'engin des pompiers', 'personnalise', { target: 'projectile_sur_engin', max: 0 }),
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
    ph('cinq-foyers', `Cinq foyers, six motos`,
      `Vingt-trois heures trente, boulevard de Magenta, par une nuit étouffante. Sur la fréquence, cinq appels en deux minutes : un pillage, deux bagarres, un feu de poubelle, un regroupement de casseurs. À l'arrière de la moto, vous tenez la radio et la caméra ; c'est vous qui notez, classez et répétez au pilote.`,
      T(100), [
        rad('CENTRAL', 'FAUCON 1', `CINQ foyers sur votre secteur. Gravité TROIS : pillage boulevard de Magenta. Gravité DEUX : bagarres boulevard de Strasbourg et devant la gare de l'Est. Gravité UN : feu de poubelle, regroupement. Vous en traitez trois.`),
        rad('FAUCON 1', 'FAUCON 2', `Le pillage d'abord. Trois minutes par intervention, retour à la colonne entre chaque.`),
      ], [`Deux appels arrivent en même temps`]),
    ph('pillage', `Le rideau forcé du boulevard de Magenta`,
      `Une boutique de téléphonie du boulevard de Magenta, rideau forcé, une dizaine de silhouettes qui entrent et sortent. La colonne s'arrête à cinquante mètres, pied à terre ensemble ; on saisit ceux qui sortent les bras chargés, et on ne court pas derrière les autres.`,
      OBJ('o2'), [
        rad('ICARE', 'FAUCON 2', `Pillage en cours, UN-ZÉRO individus. Trois sortent avec des cartons, direction gare de l'Est, trottoir de gauche. Je les filme.`),
        voix('PILOTE', `Je garde les machines. Tu as trois minutes, après je te rappelle.`),
      ], [`Un scooter est incendié devant la boutique`, `Un passant est blessé par un éclat de vitrine`]),
    ph('appel-anodin', `L'appel anodin`,
      `Deuxième appel, classé sans gravité : un feu de poubelle dans une rue latérale du boulevard de Strasbourg. La rue est sombre, vide, et deux conteneurs ont été tirés en travers un peu trop proprement. Six motos peuvent s'y engager ; elles ne pourront pas y faire demi-tour.`,
      T(180), [
        rad('CENTRAL', 'FAUCON 1', `Feu de poubelle signalé par un riverain, rue latérale du boulevard de Strasbourg. Appelant anonyme, pas de rappel possible.`),
        voix('PILOTE', `Ça ne me plaît pas. Pas un chat, et la rue est bouchée au bout. On y va à pied, ou on n'y va pas.`),
      ], [`Un guet-apens attend la colonne dans une rue latérale`, `Un appel arrive en doublon`]),
    ph('bagarre', `Trente fêtards devant la gare de l'Est`,
      `Troisième foyer : devant la gare de l'Est, deux groupes de fêtards s'affrontent à coups de poing et de bouteilles, une trentaine en tout, au milieu des voyageurs du dernier train. Trop nombreux pour un binôme seul ; à six motos, on sépare, on parle, et on ne saisit que ceux qui frappent encore.`,
      OBJ('o1'), [
        rad('CENTRAL', 'FAUCON 2', `Bagarre de TROIS-ZÉRO personnes devant la gare de l'Est. Des voyageurs au milieu.`),
        rad('FAUCON 1', 'FAUCON 2', `Personne ne s'engage seul face à plus de UN-ZÉRO. On y va à six, ou on attend.`),
      ], [`Un agent fait un malaise à cause de la chaleur`, `Des voyageurs sont pris dans la bagarre`]),
    ph('fin-de-nuit', `Deux heures du matin, la colonne`,
      `Trois appels traités. La chaleur retombe sur le boulevard de Magenta, les groupes se défont et la fréquence se calme. La colonne se reforme, six motos, douze casques ; il reste à se recompter, à boire, et à dire à la salle ce qu'on a laissé sans réponse.`,
      FIN, [
        rad('CENTRAL', 'FAUCON 1', `Reçu pour vos trois interventions. Deux foyers n'ont pas été traités : dites-moi lesquels, et pourquoi.`),
        rad('FAUCON 1', 'FAUCON 2', `Colonne reformée. Hydratez-vous, vérifiez les machines.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Répondre à trois appels successifs', 'traiter_incidents', { count: 3 }),
    ob('o2', 'Interpeller au moins trois auteurs sur faits', 'interpeller', { count: 3 }),
    os('o3', 'Revenir à la colonne entre deux interventions', 'personnalise', { target: 'retour_colonne', count: 2 }),
    os('o4', 'Ne jamais se retrouver seul face à plus de dix personnes', 'personnalise', { target: 'binome_isole', max: 0 }),
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
    `Approche calme, identification à voix haute, menottage sans brutalité, explications données à l'interpellé. Le passager filme à son tour. Le pilote garde la moto. Parlez aux observateurs : ils ont le droit de regarder.`,
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
    ph('huees', `L'arrivée sous les huées`,
      `Boulevard du Temple, la manifestation déclarée se disperse vers la place de la République. Vos trois motos arrivent sous les huées, visière levée et numéro d'identification bien visible ; cinq téléphones se braquent sur vous avant même le pied à terre, et un groupe d'observateurs en chasuble sort ses carnets.`,
      T(90), [
        rad('CENTRAL', 'FAUCON 2', `Un individu a lancé une bouteille sur un agent, boulevard du Temple. ICARE le suit. Interpellation à faire proprement : vous êtes filmés.`),
        voix('MANIFESTANT', `Les voilà, les cow-boys ! Filmez-les, filmez leurs numéros !`),
      ], [`Un objectif est collé à cinquante centimètres de votre visière`]),
    ph('designation', `Casquette bleue, à quatre-vingts mètres`,
      `Le drone désigne l'auteur : casquette bleue, blouson beige, il marche tranquillement au milieu des derniers manifestants du boulevard du Temple, à quatre-vingts mètres. Moteur coupé, béquille : un pilote reste aux machines, et c'est à deux, avec votre passager, que vous irez le chercher.`,
      T(120), [
        rad('ICARE', 'FAUCON 2', `Objectif désigné : casquette bleue, blouson beige, à HUIT-ZÉRO mètres, il s'éloigne au pas vers la place de la République. Jet de bouteille filmé.`),
        voix('OBSERVATEUR', `Bonjour, nous sommes observateurs. Votre caméra-piéton est allumée ? On peut voir le voyant ?`),
      ], [`Un observateur demande à voir la caméra-piéton`, `Un étudiant trébuche tout seul près d'une moto`]),
    ph('approche', `Vingt mètres sous cinq téléphones`,
      `Vous marchez vers la casquette bleue sur le trottoir du boulevard du Temple, sans courir, cinq téléphones à un mètre de vos épaules. S'identifier à voix haute, dire pourquoi, saisir à deux, menotter sans brutalité, expliquer à l'homme ce qui lui est reproché : chaque seconde sera revue image par image.`,
      OBJ('o5'), [
        voix('MANIFESTANTE', `Honte à vous ! Il n'a rien fait, lâchez-le ! Vous êtes filmés, vous entendez ?`),
        voix('PASSAGER', `Je filme aussi. Tu parles, je tiens son bras. Doucement.`),
      ], [`Un manifestant vous insulte à un mètre, téléphone levé`, `La caméra-piéton du passager s'éteint`]),
    ph('explications', `Ce qu'on dit aux observateurs`,
      `L'homme est menotté, debout, et vous lui avez dit pourquoi. Sur le trottoir du boulevard du Temple, le cercle des téléphones s'est resserré ; les observateurs posent des questions précises, un journaliste insiste, et une rumeur court déjà : un blessé, à cause des motos. Expliquer sans se justifier à l'excès, et ne pas s'énerver.`,
      T(150), [
        voix('OBSERVATEUR', `Quel fait lui reprochez-vous, et qui l'a constaté ? Vous lui avez notifié le motif ?`),
        rad('CENTRAL', 'FAUCON 2', `Rumeur en ligne : un blessé imputé à votre unité. Dites-moi s'il y a eu un contact avec un tiers.`),
      ], [`Rumeur d'un blessé imputé à l'unité`, `Un journaliste insiste pour obtenir une déclaration`]),
    ph('repli-propre', `Un repli propre`,
      `L'interpellé part à pied vers le fourgon de la section, encadré par deux agents. Vous regagnez vos motos, boulevard du Temple, au pas, sans un mot de trop ; remonter en selle, démarrer ensemble, et laisser derrière soi une séquence que n'importe qui pourra regarder en entier.`,
      FIN, [
        rad('CENTRAL', 'FAUCON 2', `Remise à l'officier de police judiciaire par MISTRAL UN. Transmettez la séquence de votre caméra-piéton.`),
        rad('FAUCON 1', 'FAUCON 2', `Repli en colonne par deux. Personne ne répond aux huées.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Interpeller l\'auteur sans aucune faute filmée', 'zero_bavure'),
    ob('o2', 'Rester calme sous les insultes', 'personnalise', { target: 'sang_froid' }),
    ob('o5', 'Interpeller l\'auteur du jet de bouteille désigné par le drone', 'interpeller', { target: 'cible_drone', count: 1 }),
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
    `Formez un carré avec les motos. Deux agents couvrent le collègue à terre, deux autres le relèvent et le soutiennent jusqu'à l'abri des machines. La colonne se replie par la rue de Bretagne vers la ligne de CRS. Demandez le renfort par radio dès le premier jet.`,
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
    ph('patrouille', `Six motos dans le haut Marais`,
      `Une heure du matin, rue de Bretagne. La colonne de six motos patrouille au pas, vitrines éteintes, terrasses rentrées. Au carrefour de la rue du Temple, une soixantaine de silhouettes occupent la chaussée ; elles ne s'écartent pas en entendant les moteurs.`,
      TENS(0.75), [
        rad('CENTRAL', 'FAUCON 1', `Regroupement signalé rue de Bretagne, nature inconnue. Reconnaissance seulement. La ligne de CRS la plus proche est place de la République.`),
        rad('FAUCON 1', 'FAUCON 2', `On ralentit. Personne ne s'engage au milieu. Si ça lance, on rompt.`),
      ], [`Un attroupement barre le carrefour`]),
    ph('agent-a-terre', `Un agent renversé`,
      `La tension éclate d'un coup : pavés, bouteilles, une barrière jetée dans une roue. La troisième moto de la colonne se couche et son pilote reste au sol, rue de Bretagne, à dix mètres des premiers lanceurs. On abandonne une machine s'il le faut ; on n'abandonne pas un agent.`,
      OBJ('o1'), [
        rad('FAUCON 1', 'CENTRAL', `URGENT. Pris à partie rue de Bretagne, UN agent à terre, QUATRE-ZÉRO-ZÉRO mètres de la ligne. Je demande un renfort immédiat.`),
        voix('PASSAGER', `Il est tombé ! Mets la moto en travers, je vais le chercher avec le deuxième binôme !`),
      ], [`Un agent tombe de sa moto`, `Un pavé est lancé depuis un toit`, `Une moto couchée est incendiée`]),
    ph('carre', `Le carré des machines`,
      `L'agent est relevé, soutenu par deux collègues, à l'abri derrière les motos rangées en carré au milieu de la rue de Bretagne. Il boite ; il ne conduira pas. Le renfort est à trois minutes, la foule à vingt mètres, et il y a désormais une machine de trop pour le nombre de pilotes.`,
      T(120), [
        rad('CENTRAL', 'FAUCON 1', `Renfort en route, TROIS minutes. MISTRAL UN ouvre sa ligne côté rue du Temple pour vous laisser passer.`),
        voix('AGENT BLESSÉ', `Ça va, ça va… la cheville. Ne laissez pas ma moto, elle est neuve.`),
      ], [`Panne radio de soixante secondes`, `La foule s'approche à vingt mètres du carré`]),
    ph('repli', `Quatre cents mètres jusqu'à la ligne`,
      `Repli en colonne par la rue du Temple, le blessé en passager, une moto en serre-file. Quatre cents mètres jusqu'à la ligne de CRS, place de la République, au pas : accélérer, c'est risquer une seconde chute devant ceux qui suivent en courant.`,
      OBJ('o2'), [
        rad('MISTRAL 1', 'FAUCON 1', `Je vous vois arriver par la rue du Temple. Ma ligne s'ouvre au centre, passez sans vous arrêter.`),
        rad('FAUCON 1', 'FAUCON 2', `Vous fermez la colonne. Personne derrière vous. Annoncez-moi la distance de la foule.`),
      ], [`Des projectiles suivent la colonne dans la rue du Temple`]),
    ph('derriere-la-ligne', `Derrière les boucliers`,
      `La colonne a passé la ligne et les boucliers se sont refermés derrière elle, place de la République. Moteurs coupés : on compte les casques, puis les machines. L'agent blessé part vers l'ambulance ; pour le reste, la salle veut savoir ce qui est resté rue de Bretagne.`,
      FIN, [
        rad('CENTRAL', 'FAUCON 1', `Rendez compte : agents, machines, matériel laissé sur place. SANTÉ UN prend votre blessé.`),
        rad('MISTRAL 1', 'FAUCON 1', `Ligne refermée. Je tiens le débouché de la rue du Temple.`, 'T'),
      ]),
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
    `Une moto volée est une honte pour toute la colonne : tenez-en le compte à chaque arrêt. Repoussez les curieux à la voix, sans geste brusque. Ne roulez jamais sur le parvis, même au pas, et restez joignable à la radio pendant toute l'intervention des passagers.`,
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
    ph('pilote-de-tete', `Pilote de tête`,
      `Quai de l'Hôtel de Ville, cinq binômes derrière vous, moteurs tournants. Sur le parvis de l'Hôtel de Ville, un rassemblement de soignants tourne mal ; les quais sont saturés de voitures arrêtées. C'est vous qui choisissez par où passe la colonne : personne ne vous doublera pour corriger.`,
      T(60), [
        rad('FAUCON 1', 'FAUCON 2', `Vous prenez la tête. Itinéraire libre jusqu'au parvis, arrêt à CINQ-ZÉRO mètres. Jamais sur le parvis, même au pas.`),
        rad('CENTRAL', 'FAUCON 1', `Quais saturés entre le pont Louis-Philippe et le pont d'Arcole. Pont Notre-Dame encore fluide.`),
      ]),
    ph('itineraire', `Par le pont Notre-Dame`,
      `La colonne décolle en file de binômes. Le quai de Gesvres est un parking ; reste le pont Notre-Dame, puis la rue de Lobau, derrière l'Hôtel de Ville, si rien ne s'y est mis en travers. Derrière vous, cinq motos calquent votre trajectoire à deux longueurs : chaque hésitation se multiplie par cinq.`,
      OBJ('o1'), [
        rad('ICARE', 'FAUCON 2', `Un camion de livraison est arrêté sur le pont Notre-Dame, voie de droite. Passage possible à gauche, une moto à la fois.`),
        voix('PASSAGER', `À droite, c'est bouché jusqu'au pont. Le trottoir ? Non, il y a des piétons, oublie.`),
      ], [`Un camion bloque une voie du pont Notre-Dame`, `Un badaud photographie la colonne au milieu de la chaussée`]),
    ph('garde', `Six machines à garder`,
      `Arrêt à cinquante mètres du parvis, rue de Lobau. Les passagers partent à pied vers la place de l'Hôtel de Ville ; vous restez avec un pilote sur trois, au milieu de six machines chaudes et d'un cercle de curieux qui se rapproche. Deux jeunes tournent autour de la dernière moto de la file.`,
      T(240), [
        voix('CURIEUX', `Elle est belle, celle-là. On peut monter dessus pour la photo ? Juste une seconde ?`),
        rad('FAUCON 1', 'FAUCON 2', `Passagers engagés sur le parvis. Vous gardez les machines et vous restez sur la fréquence.`),
      ], [`Deux curieux tentent de prendre une moto`, `Une moto refuse de redémarrer`]),
    ph('seconde-tentative', `Ils reviennent à quatre`,
      `Les deux jeunes reviennent à quatre, plus décidés, rue de Lobau. L'un attrape un guidon, l'autre pousse. Les repousser à la voix et du plat de la main, sans un coup, sans quitter des yeux les autres machines : une moto perdue, et c'est toute la colonne qui rentre à pied.`,
      TENS(0.52), [
        voix('VOLEUR', `Elle est à tout le monde, ta moto ! Pousse-toi !`),
        rad('FAUCON 1', 'FAUCON 2', `Ça chauffe sur le parvis. Tenez-vous prêts à rembarquer. État des machines ?`),
      ], [`Quatre individus tentent d'emporter une moto`, `Des projectiles tombent près des machines`]),
    ph('colonne-reformee', `Tout le monde remonte`,
      `La tension monte d'un cran sur le parvis et les passagers reviennent au pas de course par la rue de Lobau, certains avec un interpellé qu'un fourgon vient prendre. Six machines, douze casques : la colonne se reforme derrière vous et repart ensemble, par le chemin que vous aurez choisi.`,
      FIN, [
        rad('FAUCON 1', 'FAUCON 2', `Rembarquement. Vous reprenez la tête, repli par le quai si le pont est toujours pris.`),
        rad('CENTRAL', 'FAUCON 1', `Rendez compte : état des machines, incidents pendant la garde.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Conduire la colonne par un itinéraire libre jusqu\'au parvis', 'guider_unite', { place: 'Place de l\'Hôtel de Ville' }),
    ob('o2', 'Repousser deux tentatives de vol de moto sans coup', 'proteger_site', { target: 'motos', count: 2 }),
    os('o3', 'Ne perdre aucune moto', 'personnalise', { target: 'moto_perdue', max: 0 }),
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
