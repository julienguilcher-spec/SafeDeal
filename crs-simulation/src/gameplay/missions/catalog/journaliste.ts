/* =====================================================================================
 * Catalogue — journaliste (photographe, reporter d'images, direct) : photographier, filmer, publier.
 * Rôle civil de la carrière : chaque mission s'ouvre quand sa mission miroir est terminée.
 * « PRESSE » est utilisé tel quel ; les rédactions et les médias cités sont fictifs.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, scene, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_01, CDT_02, CDT_04 } from './commandant';
import { CRS_04, CRS_12 } from './crs';
import { EAU_02 } from './canon-eau';

const JR: Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> = { role: 'journaliste', rank: null, poste: null, profile: null };

export const JR_01 = mission({
  ...JR, type: 'formation', duration: 'courte', difficulty: 1, chapter: 13,
  id: 'journaliste-01-premier-cadrage',
  title: 'Premier cadrage',
  pitch: 'Premier atelier du photographe : régler l\'appareil, cadrer une scène calme et rapporter trois images de trois sujets différents.',
  briefing: [
    `Jardin des Tuileries, par un matin de brume. Un rédacteur en chef vous confie un appareil à téléobjectif pour un reportage d'apprentissage : un rassemblement calme de retraités. Vous avez votre brassard « PRESSE » et un casque.`,
    `Votre mission est de rapporter trois images de trois sujets différents : un portrait, une vue d'ensemble, un détail de pancarte. L'objectif est d'apprendre à cadrer et à choisir ce que l'on montre.`,
    `Réglez l'ouverture et la vitesse. Cadrez le portrait à l'œil, la vue d'ensemble depuis un point haut, le détail au téléobjectif. Demandez l'accord de la personne photographiée si elle est identifiable. Publiez les trois images dans le fil de la rédaction.`,
    `La presse peut circuler dans le dispositif et rester pendant une dispersion, tant qu'elle ne gêne pas et ne se confond pas avec les participants. En retour, elle doit montrer ce qui est : les deux camps. Ne mettez pas en scène. Ne coupez pas ce qui gêne.`,
  ],
  place: 'Jardin des Tuileries', timeOfDay: 10, weather: 'brouillard', windFrom: 270, windSpeed: 1,
  crowd: crowd(80, 'retraites', 0.05, 0.1, 0, { retraites: 0.6, familles: 0.2, curieux: 0.2 },
    ['Jardin des Tuileries'], 0.1),
  forces: forces({ sections: 0, pompiers: 0, samu: 0 }),
  intel: intel('Quatre-vingts retraités qui se retrouvent pour un rassemblement calme.', 'Aucun signalement.', ['Jardin des Tuileries'],
    ['Régler l\'appareil', 'Varier les plans', 'Respecter l\'accord des personnes']),
  phases: [
    ph('reglages', `Régler avant de lever l'appareil`,
      `Jardin des Tuileries, dix heures, dans la brume. Quatre-vingts retraités sont rassemblés près du grand bassin, pancartes écrites à la main, thermos sur les bancs. Brassard « PRESSE » au bras, casque au sac, vous réglez l'ouverture et la vitesse : dans ce gris, la lumière manque et tout bouge lentement.`,
      T(40), [
        voix('RÉDACTION', `Trois images pour apprendre : un portrait, une vue d'ensemble, un détail. Rien de mis en scène. Tu as le temps, prends-le.`),
        voix('RETRAITÉE', `Vous êtes de quel journal ? C'est pour dire du bien, ou du mal de nous ?`),
      ]),
    ph('trois-images', `Portrait, vue d'ensemble, détail`,
      `Le portrait se fait à hauteur d'yeux, après avoir demandé. La vue d'ensemble demande de la hauteur : les marches de la terrasse, au bord du jardin des Tuileries, d'où l'on voit tout le rassemblement et la brume derrière. Le détail, c'est une main sur une pancarte, au téléobjectif.`,
      OBJ('o1'), [
        voix('RETRAITÉ', `Moi, je ne veux pas être dans le journal. Ma fille ne sait pas que je manifeste.`),
        voix('RETRAITÉE', `Montrez-moi ce que ça donne ? Oh… j'ai l'air fatiguée. Vous la gardez quand même ?`),
      ], [`Un retraité refuse d'être photographié`, `La brume s'épaissit et mange le contre-jour`, `Une retraitée demande à voir son portrait`]),
    ph('envoi', `Vingt secondes sans bouger`,
      `Trois images dans la carte. Il faut maintenant les envoyer : assis sur une chaise du jardin des Tuileries, l'appareil relié au téléphone, immobile vingt secondes pendant que la barre avance. Chaque image part avec sa légende : le lieu, l'heure, ce qu'on voit, et rien de plus.`,
      OBJ('o2'), [
        voix('RÉDACTION', `Je reçois la première. La légende : qui, où, quand. Pas d'adjectif.`),
      ], [`Le réseau faiblit pendant l'envoi`]),
    ph('choix', `Laquelle fera la page`,
      `Les trois images sont dans le fil de la rédaction. Autour du bassin, les retraités replient leurs pancartes et la brume se lève sur le jardin des Tuileries. Au téléphone, on vous demande laquelle vous mettriez en tête, et pourquoi : la vue large et le portrait ne racontent pas la même matinée.`,
      FIN, [
        voix('RÉDACTION', `Bien reçu, les trois. Maintenant dis-moi : si tu n'en gardais qu'une, laquelle ? Et qu'est-ce qu'elle laisse de côté ?`),
        voix('RETRAITÉE', `Ça paraîtra quand ? Vous m'en garderez un exemplaire ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rapporter trois images de trois sujets différents', 'photographier', { count: 3 }),
    ob('o2', 'Publier la série dans le fil de la rédaction', 'publier', { count: 1 }),
    os('o3', 'Inclure une vue d\'ensemble', 'photographier', { target: 'vue_ensemble', count: 1 }),
  ],
  failures: [fail('personnalise', 'Moins de trois sujets rapportés.'), fail('temps', 'Atelier trop long.', 240)],
  randomEvents: ['Un retraité demande à voir la photo', 'La brume s\'épaissit'],
  unique: 'Un atelier sans enjeu où l\'on apprend la composition, premier outil du photographe.',
  tags: ['formation', 'photo'],
});

export const JR_02 = mission({
  ...JR, ...scene(CDT_01), difficulty: 2, chapter: 13, mirrorOf: CDT_01.id, altRoles: ['commandant'],
  id: 'journaliste-02-la-une',
  title: 'La une',
  pitch: 'De la République à la Bastille, rapporter cinq images de cinq sujets différents, dont une vue d\'ensemble et une image « deux camps ».',
  briefing: [
    `Un cortège déclaré du « Front commun des Ateliers » défile de la place de la République à la place de la Bastille. Neuf cents personnes, ambiance calme, mais la rédaction veut une une qui dise quelque chose. Vous êtes photographe pour un quotidien, « La Gazette du Marais ».`,
    `Votre mission est de rapporter cinq images de cinq sujets différents avant la clôture de l'édition du soir : une vue d'ensemble, un portrait, une pancarte lisible, un détail du service d'ordre et une image « deux camps » où l'on voit à la fois un manifestant et un policier.`,
    `Repérez un point haut pour la vue d'ensemble. Descendez dans le cortège pour les portraits. Allez à la tête pour les pancartes. À la Bastille, placez-vous au bord pour l'image « deux camps ». Publiez au fil de l'eau.`,
    `Vous pouvez franchir un cordon pour travailler : présentez-vous et montrez votre carte si on vous la demande. Ne dérangez personne. Une image sans contexte ne vaut rien : notez le lieu et l'heure.`,
  ],
  intel: intel(
    'Neuf cents marcheurs, ambiance calme ; le service d\'ordre syndical sera visible.',
    'Aucun signalement.', ['Place de la République', 'Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Repérer un point haut', 'Cadrer large puis serré', 'Noter le lieu et l\'heure']),
  phases: [
    ph('commandes', `Cinq commandes de la rédaction`,
      `Quatorze heures, place de la République. Le cortège du « Front commun des Ateliers » se met en place autour de la statue ; la rédaction de « La Gazette du Marais » veut une une qui dise quelque chose. Cinq sujets sur votre carnet : la banderole de tête, un portrait, une vue d'ensemble, le service d'ordre, et une image où l'on voie les deux camps.`,
      FOULE('depart'), [
        voix('RÉDACTION', `Cinq images, cinq sujets. Et note le lieu et l'heure de chacune : une photo sans contexte, je ne la passe pas.`),
        voix('CONFRÈRE', `Pour la vue d'ensemble, monte sur le socle côté boulevard du Temple. Dépêche-toi, on y est déjà quatre.`),
      ], [`Des confrères occupent le meilleur point haut`]),
    ph('portraits', `Dans le cortège, à hauteur de visage`,
      `Le cortège descend le boulevard du Temple, chasubles turquoise et ballons. Vous marchez dedans, à reculons devant la banderole, puis au milieu, parmi les familles : un portrait se demande, une pancarte se cadre, une vue d'ensemble se mérite. Cinq sujets différents, pas cinq fois la même banderole.`,
      OBJ('o1'), [
        voix('MANIFESTANTE', `Pas moi, s'il vous plaît. Je suis en arrêt maladie, mon patron lit votre journal.`),
        voix('MANIFESTANT', `Prenez la pancarte, pas ma tête ! Elle m'a pris une soirée, cette pancarte.`),
      ], [`Une manifestante refuse d'être photographiée`, `Averse de deux minutes sur l'objectif`, `La batterie de l'appareil faiblit`]),
    ph('cordon', `De l'autre côté du cordon`,
      `Cinq sujets sont dans la carte. À l'entrée du boulevard des Filles du Calvaire, des gardiens de la paix jalonnent en retrait, casques à la ceinture. Pour l'image que veut la rédaction, il faut passer derrière eux : se présenter, montrer sa carte de presse si on la demande, et ne gêner personne.`,
      T(200), [
        voix('CRS', `Presse ? Montrez-moi votre carte. C'est bon, passez. Restez sur le trottoir et ne vous mettez pas devant mes collègues.`),
        voix('RÉDACTION', `Il me manque toujours l'image avec les deux camps. Un manifestant, un policier, le même cadre. Sans que ça ait l'air d'un face-à-face qui n'existe pas.`),
      ], [`Un policier demande la carte de presse`]),
    ph('deux-camps', `L'image avec les deux camps`,
      `Boulevard Beaumarchais, la colonne de Juillet au fond. Une vieille dame en chasuble demande son chemin à un gardien de la paix, qui se penche pour lui répondre ; trois mètres plus loin, un enfant sur des épaules regarde les fourgons. La vue d'ensemble et l'image des deux camps sont là, quelque part, pour qui sait attendre une seconde de plus.`,
      OBJ('o2'), [
        voix('CONFRÈRE', `Tu veux quoi, toi ? La bagarre ? Il n'y en aura pas aujourd'hui. Regarde plutôt ce qui se passe vraiment.`),
        voix('RÉDACTION', `La concurrence a déjà publié une tête de cortège. Ne me refais pas la même.`),
      ], [`Un confrère publie avant vous`, `Le contre-jour écrase la colonne de Juillet`]),
    ph('cloture', `Avant la clôture de l'édition`,
      `Place de la Bastille, le cortège se disloque vers la rue Saint-Antoine et le métro. Assis sur une marche, l'appareil relié au téléphone, vous envoyez la série avec ses légendes : lieu, heure, sujet. L'édition du soir clôt dans quelques minutes ; ce qui fera la une n'est pas forcément ce que vous préférez.`,
      FIN, [
        voix('RÉDACTION', `J'attends la série. Pour la une, j'hésiterai entre la vue d'ensemble et l'image des deux camps. Tu en dis quoi ?`),
        voix('MANIFESTANTE', `Vous avez pris des photos ? On pourra les voir où ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rapporter cinq images de cinq sujets différents', 'photographier', { count: 5 }),
    ob('o2', 'Inclure une vue d\'ensemble et une image « deux camps »', 'photographier', { target: 'deux_camps', count: 2 }),
    os('o3', 'Publier avant la clôture de l\'édition du soir', 'publier', { count: 1 }),
    os('o4', 'Respecter le refus d\'une personne qui ne veut pas être photographiée', 'personnalise', { target: 'refus_respecte', count: 1 }),
  ],
  failures: [fail('personnalise', 'Moins de trois sujets rapportés.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Une manifestante refuse d\'être photographiée', 'Averse de deux minutes', 'Un policier demande la carte de presse', 'L\'appareil perd sa batterie'],
  unique: 'La même marche que le commandant, vue à hauteur d\'objectif : on montre ce qu\'il ne voit pas.',
  tags: ['photo', 'miroir', 'declaree'],
});

export const JR_03 = mission({
  ...JR, ...scene(CDT_02), difficulty: 3, chapter: 13, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'journaliste-03-parapluies',
  title: 'Parapluies',
  pitch: 'Un précortège hostile aux caméras, des parapluies déployés pour masquer, et un reportage à rapporter malgré tout.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Un précortège de trois cents personnes en tête se forme à l'avant de la banderole officielle. Il est hostile aux caméras : visages masqués, parapluies déployés. Vous êtes reporter d'images, avec votre brassard « PRESSE » et un casque.`,
    `Votre mission est de rapporter des images du précortège sans vous faire arracher la caméra, de montrer ce qui se passe sans mettre en danger les personnes cadrées et de vous extraire quand la situation se dégrade.`,
    `Restez à l'extérieur du précortège. Utilisez le téléobjectif. Ne filmez pas les visages si vous ne devez pas. Placez-vous près d'un groupe de photographes. À l'ordre de repli, quittez la zone par la rue de Turbigo.`,
    `Les violents ne veulent pas être filmés : ne forcez pas. Ne gênez jamais l'action d'un secouriste. Un journaliste n'est pas un combattant : si un parapluie s'approche de votre objectif, reculez.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés, un précortège de trois cents personnes.',
    'Une centaine d\'individus qui refusent d\'être filmés.', ['Boulevard du Temple', 'Rue de Turbigo'],
    ['Rester à l\'extérieur du précortège', 'Utiliser le téléobjectif', 'Prévoir une sortie']),
  phases: [
    ph('trottoir', `Vingt-cinq mètres, depuis le trottoir`,
      `Boulevard du Temple, à l'avant du cortège. Sur la chaussée, trois cents personnes se regroupent hors de la banderole officielle ; des capuches se relèvent, des parapluies s'ouvrent sans pluie. Vous êtes sur le trottoir, à vingt-cinq mètres, brassard « PRESSE » et casque, au téléobjectif : trois plans de ce qui se forme, sans un visage reconnaissable.`,
      OBJ('o1'), [
        voix('RÉDACTION', `Je veux le bloc qui se forme, pas des visages. Trois plans larges, et tu restes sur le trottoir.`),
        voix('CONFRÈRE', `Reste avec nous, ne t'isole pas. Ceux-là n'aiment pas les objectifs.`),
      ], [`Des parapluies s'ouvrent pour masquer ceux qui se changent`]),
    ph('parapluie', `Le parapluie devant l'objectif`,
      `Trois plans sont en boîte quand un parapluie noir vient se planter à trente centimètres de votre objectif, sur le trottoir du boulevard du Temple. Derrière lui, deux silhouettes masquées, et une main qui se pose sur la sangle de la caméra. On vous demande d'effacer, tout de suite, devant eux.`,
      T(120), [
        voix('INDIVIDU MASQUÉ', `Tu effaces. Maintenant. On te regarde faire, et après tu dégages.`),
        voix('CONFRÈRE', `Ne lâche pas la caméra, mais ne hausse pas le ton. Recule vers nous, doucement.`),
      ], [`Un individu masqué exige l'effacement des images`, `Une main tire sur la sangle de la caméra`]),
    ph('choix', `Effacer, parlementer, partir`,
      `Trois issues, aucune confortable. Effacer, et repartir les mains vides ; parlementer, en montrant que vos plans ne contiennent aucun visage ; ou reculer vers la rue de Turbigo, où les photographes se sont regroupés. Sur le boulevard du Temple, un membre du service d'ordre du cortège s'approche, brassard au bras.`,
      TENS(0.5), [
        voix('SERVICE D\'ORDRE', `Venez par là, derrière notre banderole. Ils ne vous suivront pas chez nous.`),
        voix('INDIVIDU MASQUÉ', `La presse montre nos têtes, et après c'est nous qu'on vient chercher à la maison.`),
      ], [`Le service d'ordre du cortège propose de vous abriter`, `Un vidéaste voisin est bousculé`]),
    ph('degradations', `Cadrer la casse de loin`,
      `La tension vient de monter : le bloc s'attaque à deux agences bancaires et à la ligne de CRS. Depuis le trottoir d'en face, entre deux arbres du boulevard du Temple, on peut cadrer l'affrontement de loin : les marteaux, les boucliers, la fumée. Ni dans l'axe des projectiles, ni dans celui des grenades.`,
      OBJ('o2'), [
        voix('RÉDACTION', `C'est parti, chez toi ? Une image de l'affrontement, une seule, mais lisible. Et tu ne te mets pas entre les deux.`),
        voix('CONFRÈRE', `Gaz ! Mets ton masque et protège l'objectif, ça colle.`),
      ], [`Un fumigène éclate à vos pieds`, `Retour de gaz sur le trottoir`, `Un confrère est bousculé`]),
    ph('repli-turbigo', `Le repli par la rue de Turbigo`,
      `L'image est faite. Les photographes décrochent ensemble par la rue de Turbigo, casques sur la tête, en se comptant. Dans un café resté ouvert, vous transférez la séquence ; avant de l'envoyer, il reste à passer chaque plan en revue : un visage reconnaissable, et c'est quelqu'un qu'on viendra chercher chez lui.`,
      FIN, [
        voix('RÉDACTION', `Envoie quand tu es à l'abri. Et vérifie tes plans : aucun visage identifiable, ni d'un côté ni de l'autre.`),
        voix('CONFRÈRE', `Tout le monde est là ? On est sept ? Non, six. Il manque le petit de l'agence.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rapporter trois images du précortège sans perdre la caméra', 'filmer', { count: 3 }),
    ob('o2', 'Rapporter une image de l\'affrontement', 'photographier', { target: 'affrontement', count: 1 }),
    os('o3', 'Ne pas être blessé', 'survivre'),
    os('o4', 'Publier la séquence', 'publier', { count: 1 }),
  ],
  failures: [fail('personnalise', 'Caméra détruite.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un individu tente d\'arracher la caméra', 'Retour de gaz', 'Un confrère est bousculé', 'Un fumigène éclate'],
  unique: 'Le journaliste que personne ne veut voir : filmer sans se faire casser.',
  tags: ['precortege', 'miroir'],
});

export const JR_04 = mission({
  ...JR, ...scene(CDT_04), difficulty: 4, chapter: 13, mirrorOf: CDT_04.id, altRoles: ['commandant'],
  id: 'journaliste-04-nuit-embarquee',
  title: 'Nuit embarquée',
  pitch: 'Reporter « embarqué » auprès d\'une compagnie, la nuit, dans le quartier du Palais-Royal : voir sans être de leur côté.',
  briefing: [
    `Rue Saint-Honoré, vingt-deux heures. Une cinquantaine de pilleurs attaquent des boutiques. Vous êtes reporter d'images embarqué avec une compagnie de CRS, pour une chaîne d'information en continu. Vous portez un casque et un brassard « PRESSE ».`,
    `Votre mission est de filmer la nuit en restant crédible : montrer l'action des policiers et les dégâts, sans prendre parti, et de n'être ni un obstacle pour les forces de l'ordre ni un complice. Vous devez aussi protéger vos sources.`,
    `Restez derrière la ligne, avec l'agent de liaison. Filmez les interpellations, les vitrines brisées, les feux. Interrogez les riverains. Gardez vos images pour la rédaction. Ne diffusez ni le visage d'un mineur ni celui d'un blessé.`,
    `Un embarqué est suspect pour ceux d'en face : restez à distance des affrontements. Ne portez jamais d'équipement de police. L'objectivité vaut mieux que le spectacle.`,
  ],
  intel: intel(
    'Cinq cents personnes ; une cinquantaine de pilleurs.',
    'Une quarantaine d\'individus encagoulés.', ['Rue Saint-Honoré', 'Place Vendôme', 'Rue de la Paix'],
    ['Rester derrière la ligne', 'Filmer les deux côtés', 'Ne pas porter d\'équipement de police']),
  phases: [
    ph('regles', `Les règles du chef de section`,
      `Vingt et une heures trente, près de la place Vendôme. Avant de descendre du fourgon, le chef de section vous donne ses règles : dix mètres derrière la ligne, à côté de l'agent de liaison, pas de flash pendant une saisie, pas de direct qui donne sa position. Casque et brassard « PRESSE » ; rien, sur vous, ne doit ressembler à un équipement de police.`,
      T(120), [
        voix('CHEF DE SECTION', `Vous filmez ce que vous voulez. Mais pas de flash quand mes gars sortent, et vous ne publiez pas où on est tant qu'on y est.`),
        voix('AGENT DE LIAISON', `Restez à ma gauche. Si je vous dis de vous baisser, vous vous baissez, on discutera après.`),
      ]),
    ph('vitrines', `Une vitrine, puis une saisie`,
      `Rue Saint-Honoré, une cinquantaine d'individus s'attaquent aux boutiques : un rideau de fer plie, une vitrine tombe. La section avance, les interpellateurs sortent. En basse lumière, sans flash, il faut tenir le plan : la vitrine qui cède, puis la saisie, du début à la fin, sans se mettre dans les jambes de personne.`,
      OBJ('o1'), [
        voix('AGENT DE LIAISON', `Ils sortent, à droite ! Filmez d'ici, n'avancez pas.`),
        voix('ÉMEUTIER', `Lui, là, avec la caméra ! C'est un flic en civil !`),
      ], [`Un émeutier vous prend pour un policier en civil`, `Un mortier d'artifice part dans votre direction`, `Votre flash se déclenche par erreur`]),
    ph('pompiers', `L'escorte des pompiers`,
      `Une barricade de trottinettes brûle au milieu de la rue Saint-Honoré, batteries crépitantes. Un fourgon de pompiers remonte derrière la section, sous escorte, et la lance se met en eau à vingt mètres de vous. La fumée noire mange la lumière ; un policier vous fait signe de baisser la caméra, sans dire pourquoi.`,
      T(200), [
        voix('CRS', `Baissez ça ! Vous éclairez mes collègues avec votre écran, on nous voit à cent mètres !`),
        voix('AGENT DE LIAISON', `Il n'a pas tort, pour l'écran. Baissez la luminosité, pas la caméra.`),
      ], [`Une batterie de trottinette s'embrase près des pompiers`, `Un policier vous demande de baisser la caméra`]),
    ph('autre-cote', `L'autre côté de la rue`,
      `Vous avez les policiers, de dos, depuis une heure. Il manque l'autre moitié de la nuit : les riverains aux fenêtres de la rue de la Paix, un commerçant devant son rideau tordu, un jeune assis sur un trottoir, menotté, qui regarde ses chaussures. Rapporter les deux côtés, c'est aussi savoir se retourner.`,
      OBJ('o2'), [
        voix('RÉDACTION', `Tes images sont toutes prises derrière les boucliers. Tu es embarqué, pas enrôlé. Je veux aussi ceux d'en face, et ceux qui habitent là.`),
        voix('RIVERAINE', `Vous filmez pour qui ? Venez voir d'ici ce que ça donne. Tenez, montez.`),
      ], [`Un confrère est agressé dans une rue voisine`, `Une riveraine propose de filmer depuis sa fenêtre`]),
    ph('fin-de-nuit', `Un pompier, après l'extinction`,
      `La rue Saint-Honoré se vide et la section regagne ses fourgons près de la place Vendôme. Un pompier s'est assis sur le marchepied de son engin, casque sur les genoux, le visage noir de suie. Un dernier portrait, s'il le veut bien ; puis le reportage part à la rédaction, sans le visage du mineur, sans celui du blessé.`,
      FIN, [
        voix('POMPIER', `Une photo ? Si vous voulez. Mais vous ne mettez pas mon nom.`),
        voix('RÉDACTION', `Envoie. On floute le gamin menotté et le blessé du trottoir, on est d'accord ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Filmer une interpellation et une vitrine brisée', 'filmer', { count: 2 }),
    ob('o2', 'Rapporter les deux côtés de la scène', 'photographier', { target: 'deux_camps', count: 2 }),
    os('o3', 'Ne jamais gêner les forces de l\'ordre', 'personnalise', { target: 'gene_des_forces', max: 0 }),
    os('o4', 'Publier le reportage', 'publier', { count: 1 }),
  ],
  failures: [fail('joueur_hors_combat', 'Journaliste blessé.'), fail('personnalise', 'Caméra détruite.')],
  randomEvents: ['Un pilleur vous repère', 'Un policier vous demande de baisser la caméra', 'Une batterie de trottinette s\'embrase', 'Un confrère est agressé'],
  unique: 'L\'embarqué voit l\'envers du dispositif mais n\'en fait pas partie.',
  tags: ['nuit', 'embarque', 'miroir'],
});

export const JR_05 = mission({
  ...JR, ...scene(CRS_04), difficulty: 3, chapter: 13, mirrorOf: CRS_04.id, altRoles: ['crs'],
  id: 'journaliste-05-trente-secondes-d-antenne',
  title: 'Trente secondes d\'antenne',
  pitch: 'Sur la place de la Concorde, trois duplex de trente secondes aux heures imposées, la liaison stable et l\'action dans le cadre.',
  briefing: [
    `Place de la Concorde, un cortège interdit descend les Champs-Élysées vers le pont de la Concorde. La chaîne d'information « Canal Capitale » vous demande trois duplex en direct, à 16 h 00, 16 h 20 et 16 h 40, de trente secondes chacun. Vous êtes reporter avec un caméraman et une valise de liaison.`,
    `Votre mission est de réaliser les trois duplex à l'heure, avec une liaison stable, une image où la scène se voit derrière vous et un commentaire exact. L'action doit rester dans le cadre.`,
    `Choisissez un point d'où l'on voit le pont. Installez la valise à l'abri du vent. Annoncez : « Dans trente secondes, direct. » Parlez à la caméra. Ne vous placez pas devant un cordon de CRS. Gardez dix mètres avec la foule.`,
    `Un duplex manqué est une faute. Ne commentez jamais plus que ce que vous voyez. Un commentaire de parti pris ne passe pas l'antenne. Évitez les zones de gaz.`,
  ],
  intel: intel(
    'Deux mille personnes ; le pont de la Concorde est interdit.',
    'Une soixantaine d\'individus déterminés.', ['Place de la Concorde', 'Pont de la Concorde', 'Cours la Reine'],
    ['Installer la valise à l\'abri', 'Annoncer le direct', 'Rester à dix mètres de la foule']),
  phases: [
    ph('plateau', `Un plateau avec vue sur le pont`,
      `Place de la Concorde, côté quai. La chaîne « Canal Capitale » veut trois duplex de trente secondes ; le premier dans deux minutes. Il faut un point d'où l'on voie le pont de la Concorde et son barrage, à dix mètres de la foule, jamais devant un cordon ; le caméraman cale la valise de liaison contre un candélabre, à l'abri du vent.`,
      T(120), [
        voix('RÉGIE', `Canal Capitale, la régie. On te prend dans deux minutes pour trente secondes. Dis-moi ce que tu as derrière toi.`),
        voix('CAMÉRAMAN', `Le vent fait vibrer le pied. Je me cale contre le candélabre, tu te mets à gauche, le pont dans ton dos.`),
      ], [`Un confrère d'une autre chaîne réclame le même emplacement`]),
    ph('premier-duplex', `Premier duplex : ce qu'on voit, rien d'autre`,
      `Le voyant rouge s'allume. Derrière vous, le barrage tient l'entrée du pont de la Concorde et la tête du cortège traverse la place. Trente secondes : qui est là, combien, ce qu'ils font. Pas ce qu'ils veulent, pas ce qui va se passer ; ce que vous n'avez pas vu vous-même n'existe pas à l'antenne.`,
      T(200), [
        voix('RÉGIE', `Trois, deux, un… à toi.`),
        voix('RÉGIE', `On me dit dans l'oreillette qu'il y a des blessés graves. Tu confirmes à l'antenne ?`),
      ], [`La régie vous souffle une information non vérifiée`, `La liaison saute quelques secondes`]),
    ph('deuxieme-duplex', `Deuxième duplex : la poussée dans le dos`,
      `Seize heures vingt. La foule pousse maintenant sur les boucliers du pont de la Concorde, à cinquante mètres derrière votre épaule, et des bouteilles volent par-dessus la ligne. Un manifestant se plante entre vous et l'objectif pour dire sa vérité à la France entière ; le caméraman vous regarde, il attend que vous décidiez.`,
      T(240), [
        voix('MANIFESTANT', `Dites-le, à la télé, qu'on nous empêche de passer ! Dites-le, que c'est une honte ! Laissez-moi parler !`),
        voix('RÉGIE', `Qui c'est, lui ? Tu le gardes, ou tu recadres ? On est en direct, décide.`),
      ], [`Un manifestant interrompt le direct`, `Retour de gaz sur le plateau`]),
    ph('troisieme-duplex', `Troisième duplex : les sommations`,
      `Seize heures quarante. Sur le pont de la Concorde, un officier ceint d'une écharpe tricolore lève un mégaphone : les sommations. C'est l'image du jour, et elle est à contre-jour, derrière un rideau de gaz. Garder l'action dans le cadre, la liaison stable, et la bonne distance : trente secondes, les dernières.`,
      OBJ('o1'), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('RÉGIE', `Dernier duplex. On t'entend mal, rapproche le micro. C'est quoi, ce qu'il dit au mégaphone ? Explique aux gens.`),
      ], [`Le gaz dérive vers le plateau`, `La liaison faiblit`]),
    ph('antenne-rendue', `Antenne rendue`,
      `Trois duplex, quatre-vingt-dix secondes d'antenne en tout. Le caméraman replie le pied pendant que la place de la Concorde se vide vers les Champs-Élysées. Dans l'oreillette, la régie est déjà passée au sujet suivant ; il vous reste à noter, pour vous, ce que vous avez dit, et ce que vous saviez vraiment au moment de le dire.`,
      FIN, [
        voix('RÉGIE', `On a tout eu, merci. On te reprend peut-être à dix-huit heures, reste dans le coin.`),
        voix('CAMÉRAMAN', `J'ai les yeux qui pleurent. On se replie vers le cours la Reine, je range là-bas.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Réaliser trois duplex de trente secondes aux heures imposées', 'publier', { count: 3 }),
    ob('o2', 'Garder la liaison stable pendant chaque duplex', 'personnalise', { target: 'liaison_stable', count: 3 }),
    os('o3', 'Garder l\'action dans le cadre pendant les trois duplex', 'filmer', { target: 'pont', count: 3 }),
    os('o4', 'Ne rien affirmer à l\'antenne que vous n\'ayez vu vous-même', 'personnalise', { target: 'commentaire_non_verifie', max: 0 }),
  ],
  failures: [fail('personnalise', 'Duplex manqué.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['La liaison saute', 'Retour de gaz sur le plateau', 'Un manifestant interrompt le direct', 'Un confrère demande la place'],
  unique: 'Le direct ne se rejoue pas : trente secondes pour dire quelque chose de vrai.',
  tags: ['direct', 'miroir'],
});

export const JR_06 = mission({
  ...JR, type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'journaliste-06-logo-retire',
  title: 'Logo retiré',
  pitch: 'Reporter d\'images pris à partie par un groupe hostile : s\'extraire avec son agent de protection sans perdre la caméra.',
  briefing: [
    `Boulevard de Sébastopol, une manifestation vire à l'affrontement. Un groupe de manifestants reconnaît le logo de votre chaîne sur votre caméra et vous prend à partie. Votre caméraman est entouré, un agent de protection de la rédaction vous accompagne.`,
    `Votre mission est de vous extraire sans perdre la caméra, sans blesser personne et en préservant les images déjà tournées. Vous pouvez retirer le logo, mais la caméra est la source de la mission.`,
    `Retirez le logo. Cachez la caméra. Marchez à reculons vers un cordon de CRS. Demandez à l'agent de protection de vous couvrir. Ne criez pas. Ne vous défendez pas : vous n'êtes pas armé.`,
    `Les images valent plus que la caméra : sauvegardez-les si possible. Ne remettez jamais la carte mémoire à quiconque. Votre sécurité prime sur la prise de vue.`,
  ],
  place: 'Boulevard de Sébastopol', timeOfDay: 17, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.55, 0.7, 0.2, { black_bloc: 0.25, gilets_jaunes: 0.25, militants: 0.2, curieux: 0.3 },
    ['Boulevard de Sébastopol', 'Rue Réaumur'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un groupe hostile à la presse.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard de Sébastopol', 'Rue Réaumur'],
    ['Retirer le logo', 'Se replier vers un cordon', 'Sauvegarder les images']),
  phases: [
    ph('tournage', `Tourner en lisière`,
      `Boulevard de Sébastopol, dix-sept heures. Vous tournez depuis une heure dans une manifestation qui se tend : slogans, premières poubelles renversées, visages qui se couvrent. Sur la bonnette du micro, le logo de votre chaîne ; à côté de vous, le caméraman et l'agent de protection que la rédaction vous impose depuis le mois dernier.`,
      FOULE('affrontement'), [
        voix('RÉDACTION', `Continue à tourner, mais reste en lisière. Si ça part, tu sors.`),
        voix('AGENT DE PROTECTION', `Je n'aime pas la façon dont on nous regarde depuis cinq minutes. Le logo, vous devriez l'enlever maintenant.`),
      ], [`Des manifestants dévisagent l'équipe de télévision`]),
    ph('a-reculons', `Reconnus, puis entourés`,
      `Un homme pointe du doigt le logo, puis crie le nom de la chaîne. En dix secondes, une quinzaine de personnes vous entourent. Le logo dans la poche, la caméra sous le blouson, vous reculez à trois sur le boulevard de Sébastopol, face au groupe, sans tourner le dos : ne pas courir, ne pas crier, ne pas rendre un coup.`,
      T(200), [
        voix('MANIFESTANT', `C'est eux ! La télé qui raconte n'importe quoi sur nous ! Dégagez d'ici !`),
        voix('AGENT DE PROTECTION', `On s'en va. Vous ne discutez pas, vous ne répondez pas, vous me suivez.`),
        voix('CAMÉRAMAN', `Ils m'ont pris le micro ! Laisse, laisse, on s'en fiche du micro !`),
      ], [`Un manifestant arrache le micro`, `Le caméraman est bousculé`, `Un fumigène éclate entre vous et le groupe`]),
    ph('cordon', `Le cordon s'ouvre, ou pas`,
      `À l'angle de la rue Réaumur, les boucliers sont jointifs et personne ne vous attend. Carte de presse levée au-dessus de la tête, il faut se faire reconnaître avant d'être pris pour ce que vous n'êtes pas ; derrière vous, le groupe s'est arrêté à vingt mètres et n'ose pas approcher davantage.`,
      T(120), [
        voix('CHEF DE SECTION', `Presse ? Montrez la carte. Les trois ? Passez un par un, à droite. Vite.`),
        voix('CONFRÈRE', `Ils vous ont fait le coup à vous aussi ? Nous, c'était il y a une heure. Ils ont cassé l'optique.`),
      ], [`Le cordon de CRS tarde à s'ouvrir`, `Un confrère a perdu son matériel`]),
    ph('sauvegarde', `Ce qu'il y a dans la carte`,
      `Derrière la ligne, assis sur un rebord de vitrine du boulevard de Sébastopol, vous sortez la carte mémoire. Une heure d'images : l'affrontement, ceux qui vous ont entourés, votre propre recul. Les copier tout de suite, en deux endroits ; les images valent plus que la caméra, et une carte ne se confie à personne.`,
      OBJ('o2'), [
        voix('RÉDACTION', `Vous êtes entiers ? Bon. Les images, tu les envoies maintenant, avant qu'il arrive autre chose à la carte.`),
        voix('CAMÉRAMAN', `J'ai les mains qui tremblent, fais-le, toi. La copie d'abord, l'envoi ensuite.`),
      ], [`Le réseau est saturé pendant le transfert`]),
    ph('sans-logo', `Y retourner sans logo`,
      `Les images sont en lieu sûr. De l'autre côté de la ligne, le boulevard de Sébastopol gronde toujours, et la rédaction demande si vous pouvez y retourner, bonnette nue, sans rien qui dise d'où vous venez. C'est à vous trois d'en décider ; l'agent de protection, lui, a déjà son avis.`,
      FIN, [
        voix('RÉDACTION', `Si vous y retournez, c'est sans logo et sans direct. Si vous n'y retournez pas, personne ne vous le reprochera.`),
        voix('AGENT DE PROTECTION', `Mon avis, vous le connaissez. Mais c'est votre métier, pas le mien.`),
      ]),
  ],
  objectives: [
    ob('o1', 'S\'extraire sans perdre la caméra', 'personnalise', { target: 'camera_perdue', max: 0 }),
    ob('o2', 'Sauvegarder les images déjà tournées', 'personnalise', { target: 'images_sauvegardees' }),
    os('o3', 'Retirer le logo avant de s\'éloigner', 'personnalise', { target: 'logo_retire' }),
    os('o4', 'Ne se défendre à aucun moment', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Caméra détruite.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un manifestant arrache le micro', 'Un confrère est bousculé', 'Un fumigène éclate', 'Un cordon de CRS se referme'],
  unique: 'Le logo, devenu cible : l\'enjeu est de rester un témoin sans devenir une victime.',
  tags: ['agression', 'presse'],
});

export const JR_07 = mission({
  ...JR, ...scene(EAU_02), difficulty: 3, chapter: 13, mirrorOf: EAU_02.id, altRoles: ['operateur_canon_eau'],
  id: 'journaliste-07-dispersion',
  title: 'Dispersion',
  pitch: 'Rester après les sommations, identifiable, et filmer la séquence complète : annonce, sommations, emploi de la force.',
  briefing: [
    `Place de la Bastille, fin de manifestation. Quatre cents personnes refusent de se disperser malgré les sommations. L'engin lanceur d'eau est prêt. Vous êtes reporter d'images de la chaîne « Canal Capitale ». Votre brassard « PRESSE » est visible.`,
    `Votre mission est de filmer la séquence complète : annonce, première sommation, dernière sommation, emploi de la force. Vous restez identifiable, à bonne distance, sans gêner l'action.`,
    `Placez-vous à l'angle de la rue de Lyon, à vingt mètres de la ligne. Filmez l'annonce, les sommations, puis le jet. Gardez l'horodatage. Ne vous placez pas devant la tourelle. Si les forces vous demandent de vous éloigner, négociez.`,
    `Rester après les sommations est un droit pour la presse, à condition de ne pas être confondu avec les manifestants. Un jet d'eau peut vous mouiller : protégez la caméra.`,
  ],
  intel: intel(
    'Quatre cents personnes ; une trentaine de lanceurs de bouteilles.',
    'Une trentaine d\'individus déterminés.', ['Place de la Bastille', 'Rue de Lyon'],
    ['Se placer à vingt mètres de la ligne', 'Filmer annonce, sommations, force', 'Protéger la caméra de l\'eau']),
  phases: [
    ph('angle', `L'angle de la rue de Lyon`,
      `Place de la Bastille, dix-neuf heures. Quatre cents personnes refusent de partir ; derrière la ligne, un engin lanceur d'eau attend, tourelle au repos. Vous vous placez à l'angle de la rue de Lyon, de côté, à vingt mètres des boucliers : ni dans l'axe des bouteilles, ni dans celui de la tourelle, brassard « PRESSE » bien visible.`,
      T(100), [
        voix('RÉDACTION', `Je veux la séquence entière, dans l'ordre : l'annonce, les sommations, puis ce qu'ils font. Avec l'heure à l'image.`),
        voix('CRS', `La presse, vous restez là si vous voulez, mais pas devant l'engin. Et gardez votre brassard visible.`),
      ]),
    ph('echarpe', `L'écharpe et le mégaphone`,
      `Un officier ceint de l'écharpe tricolore s'avance, mégaphone levé. C'est le premier plan de la séquence : l'écharpe, le visage, les mots, et dans le fond ceux à qui ils s'adressent. Trois formules, dans l'ordre ; entre chacune, la place de la Bastille siffle, et quelques dizaines de personnes s'en vont par la rue de Lyon.`,
      T(150), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('COMMANDANT', SOMMATIONS.premiere),
        voix('COMMANDANT', SOMMATIONS.derniere),
      ], [`Un policier demande à la presse de s'éloigner`]),
    ph('eau', `L'eau, par gradation`,
      `L'avertissement, puis la pluie, puis le jet diffus : l'eau tombe sur les premiers rangs et la place de la Bastille brille. Tout filmer sans cesser d'être reconnaissable : mains et caméra apparentes, casque sur la tête, jamais mêlé à ceux qui lancent. Un manifestant glisse sur le pavé mouillé, à trois mètres de vous.`,
      OBJ('o1'), [
        voix('HAUT-PARLEUR DE L\'ENGIN', `Attention, usage du canon à eau. Reculez.`),
        voix('CRS', `Vous, la presse ! Reculez derrière l'abribus, vous allez prendre le jet !`),
      ], [`Un manifestant glisse devant vous`, `Le jet d'eau atteint la caméra`, `Un confrère filme la scène sous un autre angle`]),
    ph('envoi', `L'envoi, les mains mouillées`,
      `La séquence est complète : annonce, sommations, emploi de la force, dans l'ordre et sans coupe. Sous l'auvent d'un café de la rue de Lyon, vous essuyez l'objectif et lancez le transfert. La rédaction veut couper pour faire court ; ce qui fait la valeur de ces images, c'est précisément qu'elles ne soient pas coupées.`,
      FOULE('dispersion'), [
        voix('RÉDACTION', `Trois minutes, c'est trop long pour l'antenne. Je garde le jet d'eau et je coupe les sommations ?`),
        voix('CONFRÈRE', `Ils ont coupé les sommations chez nous, la dernière fois. On a passé la semaine à s'expliquer.`),
      ], [`La rédaction veut couper les sommations au montage`]),
    ph('horodatage', `L'heure à l'image`,
      `La place de la Bastille se vide, luisante sous les réverbères. La séquence part avec son horodatage : l'heure de l'annonce, celle de chaque sommation, celle du premier jet. Demain, quelqu'un s'en servira pour dire que tout était régulier, quelqu'un d'autre pour dire le contraire ; les deux regarderont la même image.`,
      FIN, [
        voix('RÉDACTION', `On diffuse à vingt heures. Tu me confirmes l'heure de la dernière sommation ?`),
        voix('MANIFESTANT', `Vous avez tout filmé ? Même quand il a dit de partir ? Bon. Au moins, ce sera dit.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Filmer la séquence complète annonce, sommations, force', 'filmer', { count: 4 }),
    ob('o2', 'Rester identifiable, brassard visible, à vingt mètres au moins de la ligne', 'personnalise', { target: 'distance_de_la_ligne', count: 20 }),
    os('o3', 'Publier la séquence avec l\'horodatage', 'publier', { count: 1 }),
    os('o4', 'Protéger la caméra de l\'eau', 'personnalise', { target: 'protection_camera' }),
  ],
  failures: [fail('personnalise', 'Séquence incomplète.'), fail('interpelle', 'Journaliste interpellé.')],
  randomEvents: ['Un jet d\'eau touche la caméra', 'Un policier demande d\'éloigner la presse', 'Un manifestant glisse', 'Un confrère filme sous un autre angle'],
  unique: 'Le témoin de la séquence légale : la sommation et son usage vus de dehors.',
  tags: ['dispersion', 'miroir'],
});

export const JR_08 = mission({
  ...JR, ...scene(CRS_12), difficulty: 4, chapter: 13, mirrorOf: CRS_12.id, altRoles: ['crs'],
  id: 'journaliste-08-la-preuve',
  title: 'La preuve',
  pitch: 'Une faute et une violence contre un policier à une minute d\'écart : filmer les deux, refuser de remettre la carte mémoire.',
  briefing: [
    `Rue de Rivoli, sous les arcades. Un cortège sauvage de quelques dizaines de personnes casse des vitrines. Vous êtes reporter d'images pour la chaîne « Canal Capitale ». En l'espace d'une minute, vous voyez deux scènes : un manifestant lance un projectile sur un policier, puis un policier frappe un manifestant à terre.`,
    `Votre mission est de filmer les deux scènes, de garder vos images intactes et de refuser, avec calme, de remettre votre carte mémoire à quiconque. Les deux scènes sont des preuves.`,
    `Placez-vous sous une arcade avec dégagement. Filmez la première scène, puis la seconde. Appuyez sur « enregistrer » avant que l'action ne commence. Si un agent exige la carte, répondez : « Je ne remets pas mes images, vous pouvez saisir la justice. »`,
    `Ne choisissez pas : montrez les deux. Une seule des deux scènes filmée est une faute professionnelle. Ne diffusez pas sans vérification.`,
  ],
  intel: intel(
    'Trois cents personnes en cortège sauvage, sous les arcades.',
    'Une soixantaine d\'individus encagoulés.', ['Rue de Rivoli', 'Rue de Castiglione'],
    ['Placer la caméra avant l\'action', 'Filmer les deux scènes', 'Refuser la saisie de la carte']),
  phases: [
    ph('arcade', `Une arcade avec du recul`,
      `Rue de Rivoli, sous les arcades. Un cortège sauvage remonte la rue en brisant des vitrines ; des policiers sortent du rang par deux pour interpeller. Vous cherchez une arcade d'où l'on voie la chaussée et le trottoir d'en face, avec un mur dans le dos. La caméra tourne avant que quelque chose arrive : après, il est trop tard.`,
      T(100), [
        voix('RÉDACTION', `Tu enregistres en continu. Ce qui compte, c'est ce qui se passe avant et après, pas seulement le moment qui fait mal.`),
        voix('CONFRÈRE', `Je me mets de l'autre côté de la rue. À nous deux, on aura les deux angles.`),
      ]),
    ph('deux-scenes', `Deux scènes en une minute`,
      `La première : un homme masqué lance une bouteille qui éclate sur le casque d'un policier. La seconde, quarante secondes plus tard, à dix mètres de là : un policier porte un coup de bâton à un manifestant déjà à terre, rue de Rivoli, sous votre objectif. Les deux sont vraies ; aucune n'efface l'autre.`,
      OBJ('o1'), [
        voix('MANIFESTANT', `Vous avez filmé ? Il l'a frappé par terre ! Vous l'avez, ça ? Montrez-le, montrez que ça !`),
        voix('CRS', `Vous filmez quoi, là ? Baissez votre caméra. Baissez-la, je vous dis.`),
      ], [`Un manifestant lance un projectile sur un policier`, `Un policier frappe un manifestant à terre`, `Un agent pose la main sur l'objectif`]),
    ph('carte-memoire', `On vous demande la carte`,
      `Les deux scènes sont dans la carte. Un gradé vient vers vous sous l'arcade de la rue de Rivoli, la main tendue : il veut la carte mémoire, pour l'enquête, dit-il. Vos images ne se saisissent pas sur un trottoir ; elles se demandent à un juge. Le dire calmement, sans reculer et sans provoquer, fait partie du métier.`,
      T(150), [
        voix('OFFICIER', `Vous avez filmé une infraction. Je vous demande de me remettre vos images. La carte, s'il vous plaît.`),
        voix('RÉDACTION', `Ne donne rien. Dis-lui que la rédaction répondra à une réquisition. Et reste poli.`),
      ], [`Un officier exige la carte mémoire`, `Un manifestant vous désigne aux policiers`]),
    ph('montage', `La séquence entière, ou l'extrait`,
      `Au téléphone, la rédaction veut les images tout de suite : un concurrent vient de publier dix secondes, celles du coup de bâton, sans ce qui précède. Dans un hall de la rue de Castiglione, vous avez les deux scènes sur l'écran. La séquence entière dure une minute dix ; l'extrait qui « marche » en dure huit.`,
      T(180), [
        voix('RÉDACTION', `Ils ont sorti le coup de bâton, seul. On est en retard. Envoie-moi tes huit secondes, on complétera après.`),
        voix('CONFRÈRE', `J'ai l'autre angle. On voit la bouteille, puis le coup. Si tu veux, on publie les deux ensemble.`),
      ], [`Un concurrent publie un extrait tronqué`, `La batterie de la caméra se vide`]),
    ph('legende', `Trois légendes, une seule exacte`,
      `Il manque la phrase qui ira sous les images. Trois propositions sur l'écran de la rédaction : l'une ne parle que du policier, l'autre que du manifestant, la troisième dit ce qu'on voit, dans l'ordre où on le voit, rue de Rivoli, à dix-neuf heures douze.`,
      FIN, [
        voix('RÉDACTION', `Trois légendes. Choisis. Et souviens-toi que c'est ta signature qui sera dessous.`),
        voix('RÉDACTION', `La préfecture et le collectif nous appellent tous les deux. Chacun veut que tu coupes l'autre moitié.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Filmer les deux scènes', 'filmer', { count: 2 }),
    ob('o2', 'Conserver la carte mémoire', 'personnalise', { target: 'carte_memoire_conservee' }),
    os('o3', 'Ne pas gêner les forces de l\'ordre', 'personnalise', { target: 'gene_des_forces', max: 0 }),
    os('o4', 'Publier après vérification', 'publier', { count: 1 }),
  ],
  failures: [fail('personnalise', 'Une seule des deux scènes est filmée.'), fail('interpelle', 'Journaliste interpellé pour refus de remise.')],
  randomEvents: ['Un agent exige la carte', 'Un manifestant vous dénonce', 'Une batterie se vide', 'Un confrère filme sous un autre angle'],
  unique: 'Les deux scènes opposées : le journalisme n\'a pas de camp.',
  tags: ['preuve', 'miroir'],
});

export const JR_09 = mission({
  ...JR, type: 'emeute_nocturne', difficulty: 3, chapter: 13,
  id: 'journaliste-09-direct-de-vingt-heures',
  title: 'Direct de vingt heures',
  pitch: 'Le journal de vingt heures vous attend en direct devant l\'Hôtel de Ville : une émeute qui bouge, un commentaire à tenir.',
  briefing: [
    `Place de l'Hôtel de Ville, vingt heures. Une émeute éclate sur le parvis : barricades, feux, projectiles. Votre chaîne, « Canal Capitale », a besoin d'un direct pour le journal du soir. Vous êtes reporter avec un caméraman et une valise de liaison.`,
    `Votre mission est de tenir un direct de deux minutes, en commentant ce que vous voyez sans parti pris, sans vous mettre en danger et sans diffuser d'image qui expose une personne. Le direct commence à vingt heures pile.`,
    `Choisissez un point d'où l'on voit tout : le parvis, la façade de l'Hôtel de Ville, la rue de Rivoli. Annoncez : « Nous sommes en direct. » Décrivez ce que vous voyez : qui est là, combien, ce qu'ils font. Évitez les noms et les visages. Gardez la distance.`,
    `Un direct se rattrape mal : une erreur est entendue par des millions. Ne spéculez pas. Si une scène sort du cadre, coupez. Votre sécurité prime sur l'audience.`,
  ],
  place: 'Place de l\'Hôtel de Ville', timeOfDay: 20, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(500, '', 0.6, 0.75, 0.3, { black_bloc: 0.3, fetards: 0.2, curieux: 0.3, gilets_jaunes: 0.2 },
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'], 0.15),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Cinq cents personnes, barricades et feux.',
    'Une centaine d\'individus déterminés.', ['Place de l\'Hôtel de Ville', 'Rue de Rivoli'],
    ['Choisir un point de vue', 'Décrire sans parti pris', 'Éviter de montrer les visages']),
  phases: [
    ph('point-d-appui', `Un point d'appui stable`,
      `Vingt heures moins deux, place de l'Hôtel de Ville. Sur le parvis, des barricades brûlent et des projectiles volent vers les lignes ; le journal du soir de « Canal Capitale » ouvre sur vous. Il faut un point d'où l'on voie le parvis, la façade et la rue de Rivoli, un appui pour le pied de caméra, et dix mètres de marge.`,
      T(100), [
        voix('RÉGIE', `Ouverture du journal dans deux minutes. Deux minutes d'antenne pour toi. Qu'est-ce que tu me montres ?`),
        voix('CAMÉRAMAN', `Ici, contre la fontaine : j'ai le parvis et la façade. Mais on est à quinze mètres des pavés qui tombent.`),
      ], [`La liaison saute pendant les essais`]),
    ph('direct', `Deux minutes sans droit à l'erreur`,
      `Le voyant s'allume. Plan fixe sur vous, panoramique lent vers le parvis de l'Hôtel de Ville, zoom sur la barricade. Dire qui est là, combien, ce qu'ils font ; pas de nom, pas de visage, pas de « on me dit que ». À cinq mètres, un homme tombe, touché à la tête : il sera dans le champ si le caméraman tourne d'un quart.`,
      OBJ('o1'), [
        voix('RÉGIE', `Trois, deux, un… antenne.`),
        voix('MANIFESTANT', `La télé ! Filmez ça ! Filmez ce qu'ils nous font !`),
        voix('CAMÉRAMAN', `Blessé à droite, à cinq mètres. Je vais dessus, ou je reste large ?`),
      ], [`Un manifestant s'invite dans le champ`, `Un homme blessé tombe à cinq mètres de la caméra`, `Un projectile tombe à proximité`]),
    ph('escalade', `Rester, ou reculer derrière le cordon`,
      `L'antenne est rendue, mais la régie veut vous reprendre dans dix minutes, « si ça chauffe encore ». Ça chauffe : les pavés tombent maintenant à moins de dix mètres de votre pied de caméra, place de l'Hôtel de Ville, et un confrère vient de s'asseoir par terre, la main sur l'arcade sourcilière.`,
      FOULE('dispersion'), [
        voix('RÉGIE', `On te reprend à vingt heures dix si tu restes où tu es. Tu peux rester ?`),
        voix('CAMÉRAMAN', `Ça tombe à cinq mètres. Moi, je dis qu'on recule derrière les CRS, avenue Victoria, et qu'on verra de là.`),
      ], [`Un confrère est touché par un projectile`, `Les projectiles tombent à moins de dix mètres`]),
    ph('apres-le-direct', `Ce qu'on a dit à des millions de gens`,
      `La place de l'Hôtel de Ville se vide dans la fumée, et le journal est passé à autre chose. Sur l'écran de contrôle, le caméraman repasse vos deux minutes : chaque phrase est partie, on ne peut plus rien reprendre. Ce qui était vu reste vrai ; ce qui était deviné, il faudra peut-être le corriger demain.`,
      FIN, [
        voix('RÉGIE', `On a un doute sur un chiffre que tu as donné. Tu l'as vu, ou on te l'a dit ?`),
        voix('CAMÉRAMAN', `Écoute ce passage : tu donnes un nombre. On en voyait combien, à l'image ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir un direct de deux minutes sans erreur factuelle', 'filmer', { target: 'direct', count: 1, seconds: 120 }),
    ob('o2', 'Décrire nature, volume, attitude à chaque prise de parole', 'filmer', { count: 3 }),
    os('o3', 'Ne montrer à l\'antenne aucun visage identifiable de mineur ou de blessé', 'personnalise', { target: 'visage_identifiable', max: 0 }),
    os('o4', 'Reculer derrière le cordon dès que des projectiles tombent à moins de dix mètres', 'personnalise', { target: 'recul_a_temps', count: 1 }),
  ],
  failures: [fail('personnalise', 'Erreur factuelle diffusée.'), fail('joueur_hors_combat', 'Journaliste blessé.')],
  randomEvents: ['Un manifestant s\'invite dans le champ', 'La liaison saute', 'Un projectile tombe à proximité', 'Un confrère est touché'],
  unique: 'Le direct est un exercice de sang-froid : on parle pendant que le monde brûle derrière soi.',
  tags: ['direct', 'nuit'],
});

export const JR_10 = mission({
  ...JR, type: 'securisation', difficulty: 1, chapter: 13,
  id: 'journaliste-10-le-lendemain',
  title: 'Le lendemain',
  pitch: 'Le matin après la casse : photographier les dégâts, recueillir deux témoignages et rédiger un papier juste.',
  briefing: [
    `Boulevard de Magenta, neuf heures du matin. La veille, une manifestation a tourné à l'émeute : vitrines brisées, façades noircies, rideaux de fer arrachés. Les commerçants nettoient. Vous êtes reporter pour un quotidien, « La Gazette du Marais ».`,
    `Votre mission est de photographier les dégâts, de recueillir deux témoignages de commerçants et de rédiger un papier juste, sans emphase. Il n'y a pas de danger mais votre travail déterminera la façon dont la rue se souviendra.`,
    `Parcourez le boulevard. Photographiez les vitrines, les façades, les rideaux. Parlez à deux commerçants. Notez leurs noms et leurs mots. Vérifiez les faits auprès de la préfecture. Publiez.`,
    `Un papier qui exagère nuit à tout le monde. Ne demandez rien aux commerçants qu'ils ne veuillent pas dire. Respectez les gens qui nettoient : ils travaillent.`,
  ],
  place: 'Boulevard de Magenta', timeOfDay: 9, weather: 'couvert', windFrom: 250, windSpeed: 2, duration: 'courte',
  crowd: crowd(60, '', 0.05, 0.1, 0, { riverains: 0.6, curieux: 0.4 },
    ['Boulevard de Magenta'], 0.1),
  forces: forces({ sections: 0, pompiers: 0, samu: 0 }),
  intel: intel('Une soixantaine de commerçants et de riverains qui nettoient.', 'Aucun radical.', ['Boulevard de Magenta'],
    ['Photographier les dégâts', 'Interroger deux commerçants', 'Vérifier les faits']),
  phases: [
    ph('inventaire', `Ce que la nuit a laissé`,
      `Neuf heures, boulevard de Magenta. La veille, une manifestation a tourné à l'émeute : vitrines étoilées, abribus en miettes, rideaux de fer tordus, la carcasse d'un scooter collée au bitume. Les commerçants balaient. Cinq dégâts différents à photographier, à hauteur de trottoir, sans faire poser personne devant.`,
      OBJ('o1'), [
        voix('RÉDACTION', `Pas de sensationnel. Ce qui est cassé, où, et qui le répare. Cinq images, cinq légendes.`),
        voix('COMMERÇANT', `Encore un journaliste. Hier vous filmiez les casseurs, aujourd'hui vous photographiez les dégâts. Et nous, on balaie.`),
      ], [`Un commerçant en colère refuse de parler`, `Des touristes se photographient devant la carcasse du scooter`]),
    ph('temoignages', `Deux voix, mot pour mot`,
      `Les images sont faites. Reste la parole : une libraire qui scotche du carton sur sa vitrine, un agent de propreté qui pousse du verre depuis six heures du matin, une riveraine à sa fenêtre du boulevard de Magenta, un jeune revenu aider avec un balai. Deux témoignages suffisent, notés mot pour mot, avec le nom de ceux qui veulent bien le donner.`,
      OBJ('o2'), [
        voix('LIBRAIRE', `Vous notez ce que je dis, pas ce que vous voudriez que je dise ? Alors d'accord. Asseyez-vous.`),
        voix('AGENT DE PROPRETÉ', `Moi, je n'ai rien à dire. Je ramasse. Vous pouvez écrire ça : il ramasse.`),
      ], [`Un riverain montre une vidéo de la nuit`, `Averse sur le boulevard`]),
    ph('verification', `Un chiffre à vérifier`,
      `Deux témoignages au carnet. La libraire a parlé de « trente vitrines » ; l'agent de propreté, de douze. Avant d'écrire un chiffre, il faut l'avoir compté soi-même ou obtenu d'une source qui en répond : un appel à la préfecture, pendant qu'un confrère, sur le trottoir d'en face du boulevard de Magenta, dicte déjà son papier.`,
      T(150), [
        voix('RÉDACTION', `Trente vitrines, tu les as comptées ? Non ? Alors tu ne l'écris pas. Appelle la préfecture.`),
        voix('CONFRÈRE', `J'ai mis « un quartier dévasté ». Ça passe mieux que douze vitrines, non ?`),
      ], [`Un confrère publie avant vous`]),
    ph('angle', `L'angle du papier`,
      `Dix heures passées. Le boulevard de Magenta a rouvert, les cartons remplacent les vitres. Sur votre écran, cinq images et deux voix ; il reste à choisir par où commencer : par la carcasse, par la libraire, ou par le jeune homme au balai. Un papier qui exagère nuit à tout le monde, y compris à ceux qu'il croit défendre.`,
      FIN, [
        voix('RÉDACTION', `Tu as jusqu'à onze heures. Dis-moi ton angle en une phrase, sans adjectif.`),
        voix('LIBRAIRE', `Vous m'enverrez l'article ? Que je voie si je me reconnais.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Photographier au moins cinq dégâts différents', 'photographier', { count: 5 }),
    ob('o2', 'Recueillir deux témoignages de commerçants', 'filmer', { target: 'temoignage', count: 2 }),
    os('o3', 'Publier un papier sans emphase', 'publier', { count: 1 }),
    os('o4', 'Vérifier un fait auprès de la préfecture', 'personnalise', { target: 'verification' }),
  ],
  failures: [fail('personnalise', 'Moins de trois dégâts photographiés.'), fail('temps', 'Papier non rendu.', 600)],
  randomEvents: ['Un commerçant refuse de parler', 'Un riverain montre une vidéo', 'Une averse', 'Un confrère vous devance'],
  unique: 'Une mission sans danger : la prudence du journaliste se joue sur les mots.',
  tags: ['apres-coup', 'enquete'],
});

export const JOURNALISTE: MissionDef[] = [
  JR_01, JR_02, JR_03, JR_04, JR_05, JR_06, JR_07, JR_08, JR_09, JR_10,
];
