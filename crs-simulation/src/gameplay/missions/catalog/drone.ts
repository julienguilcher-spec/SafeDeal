/* =====================================================================================
 * Catalogue — télépilote de drone (indicatif « ICARE ») : voir, désigner, guider.
 * Le drone ne tire pas : il repère les signes avant-coureurs et guide les unités.
 * Détachement facultatif de la carrière (chapitre 11), dans un périmètre de vol autorisé.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, scene, T, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_02 } from './commandant';
import { CRS_05 } from './crs';
import { BRAVM_02 } from './bravm';

const PILOTE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'telepilote', rank: 'brigadier_chef', poste: 'telepilote' };

export const DRONE_01 = mission({
  ...PILOTE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 11,
  id: 'drone-01-arrete-prefectoral',
  title: 'Arrêté préfectoral',
  pitch: 'Premier vol : décoller dans le périmètre autorisé, ne jamais le quitter et rendre compte de la zone.',
  briefing: [
    `Esplanade des Invalides, un matin clair. Un arrêté préfectoral autorise le vol d'un drone de surveillance dans un périmètre de trois cents mètres autour de l'esplanade, à cent mètres d'altitude maximum. Vous êtes télépilote : votre unité vole sous l'indicatif « ICARE ».`,
    `Votre mission est de décoller, de rester dans le périmètre autorisé et sous le plafond de cent mètres, de survoler trois points de contrôle et de rendre compte à la radio. Un franchissement du périmètre rend le vol illégal.`,
    `Vérifiez la batterie, la météo et le périmètre sur la carte. Décollez au signal. Suivez le trajet entre trois balises. Si la batterie passe sous vingt pour cent, rentrez. Annoncez chaque balise : « Balise 1, RAS. »`,
    `Le drone ne filme pas les domiciles : respectez les consignes de floutage. Un drone qui sort du périmètre est immédiatement rappelé. La batterie est une contrainte réelle.`,
  ],
  place: 'Esplanade des Invalides', timeOfDay: 9.5, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ drone: true }),
  intel: intel('Périmètre autorisé de trois cents mètres, plafond de cent mètres.', 'Aucun signalement.', ['Esplanade des Invalides'],
    ['Vérifier batterie et météo', 'Rester dans le périmètre', 'Rentrer sous vingt pour cent de batterie']),
  phases: [
    ph('arrete', `Lire l'arrêté avant de décoller`,
      `Esplanade des Invalides, un matin clair. Sur la tablette, l'arrêté préfectoral du jour se dessine en surbrillance : un périmètre de trois cents mètres autour de l'esplanade, cent mètres de plafond, une plage horaire. Hors de ce polygone, le drone n'a pas le droit d'exister ; dedans, il ne filme ni les fenêtres ni les entrées d'immeubles.`,
      T(30), [
        voix('MONITEUR', `Périmètre, plafond, horaires. Vous me les récitez avant de toucher aux manettes.`),
        voix('ASSISTANT DE VOL', `Batterie à cent pour cent, vent d'ouest à deux mètres par seconde, douze satellites. Prêt quand tu veux.`),
      ]),
    ph('trois-balises', `Trois balises sous le plafond`,
      `Décollage vertical jusqu'à quatre-vingts mètres, puis cap sur la première des trois balises posées sur les pelouses de l'esplanade des Invalides. La limite du périmètre apparaît en rouge dans le viseur, du côté de la rue de l'Université ; un coup de vent suffit à y pousser l'appareil.`,
      OBJ('o1'), [
        rad('CENTRAL', 'ICARE', `Décollage autorisé. Annoncez chaque balise survolée.`),
        voix('ASSISTANT DE VOL', `Rafale ! Tu dérives vers la limite, trente mètres. Corrige.`),
      ], [`Un coup de vent déporte le drone vers la limite du périmètre`, `Un oiseau croise la trajectoire`, `Le signal faiblit derrière un immeuble`]),
    ph('batterie', `Vingt pour cent, on rentre`,
      `Trois balises survolées. La jauge de batterie descend plus vite avec le vent de face : à vingt pour cent, on ne discute pas, on rentre. Retour en ligne droite au-dessus de l'esplanade des Invalides, sans couper par-dessus les immeubles.`,
      T(50), [
        voix('ASSISTANT DE VOL', `Vingt-quatre pour cent. Vingt-deux. Tu rentres maintenant, ou tu poses où tu peux dans une minute.`),
        voix('MONITEUR', `Un drone qui tombe faute de batterie, c'est deux kilos sur la tête de quelqu'un.`),
      ]),
    ph('releve', `Poser, puis passer la main`,
      `L'appareil se pose sur son tapis, hélices arrêtées, au bord de l'esplanade des Invalides. Changement de batterie, relève du télépilote : on transmet l'état de l'appareil, ce qu'on a vu, et l'heure exacte à laquelle l'autorisation de vol prend fin.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Posé, reçu. Rendez compte : balises, altitude maximale, batterie restante.`),
        voix('MONITEUR', `Sur une vraie manifestation, il vous arrivera de voir quelque chose juste de l'autre côté de la limite. Vous n'irez pas.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Survoler les trois balises sans sortir du périmètre', 'duree', { count: 3, seconds: 120 }),
    ob('o2', 'Rester sous le plafond de cent mètres', 'personnalise', { target: 'plafond_altitude', max: 100 }),
    os('o3', 'Rentrer avec plus de vingt pour cent de batterie', 'personnalise', { target: 'batterie', count: 20 }),
  ],
  failures: [fail('personnalise', 'Franchissement du périmètre : vol illégal.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Un coup de vent déporte le drone', 'Un oiseau croise la trajectoire'],
  unique: 'Le drone est contraint par la loi : le périmètre de vol est la première règle.',
  tags: ['formation', 'drone'],
});

export const DRONE_02 = mission({
  ...PILOTE, ...scene(CDT_02), difficulty: 4, chapter: 11, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'drone-02-les-signes',
  title: 'Les signes',
  pitch: 'Dans le précortège du boulevard du Temple, repérer changements de tenue, parapluies et dépavage pour prévenir le commandant avant le premier jet.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Un précortège de trois cents personnes se forme en avant des huit mille marcheurs déclarés. Vous pilotez le drone d'appui du commandant, dans un périmètre de vol qui englobe tout le boulevard. Vous voyez ce que personne ne voit.`,
    `Votre mission est de repérer au moins trois signes avant-coureurs (changements de tenue, parapluies déployés, dépavage, barrières de chantier tirées) et de les signaler au commandant avant le premier jet. Plus tôt vous parlez, plus le commandant a de choix.`,
    `Volez à soixante mètres au-dessus de la tête de cortège. Balayez les groupes. Annoncez : « Nature, volume, attitude. » Désignez les blocs avec un marquage. N'orientez pas la caméra vers les fenêtres. Gardez le contact visuel avec la tête.`,
    `Une fausse alerte coûte autant qu'un oubli. Ne désignez que ce que vous voyez. Marquez les individus, pas la foule. Votre batterie dure vingt-cinq minutes.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés, un précortège de trois cents personnes en tête.',
    'Une centaine d\'individus déterminés en noir, avec parapluies.', ['Boulevard du Temple', 'Rue de Turbigo', 'Rue du Temple'],
    ['Voler à soixante mètres', 'Annoncer nature, volume, attitude', 'Marquer les individus, pas la foule']),
  phases: [
    ph('rassemblement', `La place vue de soixante mètres`,
      `Soixante mètres au-dessus de la place de la République. Le cortège du « Front commun des Ateliers » se forme derrière sa banderole : chasubles, ballons, camion sono. D'en haut, on voit autre chose : des gens qui marchent à contre-courant, des sacs trop lourds, un groupe qui se rassemble sans drapeau du côté du boulevard du Temple.`,
      FOULE('depart'), [
        rad('MISTRAL', 'ICARE', `Vous êtes mes yeux sur la tête de cortège. Ce qui se prépare, je veux le savoir avant que ça parte : nature, volume, attitude.`),
        voix('ASSISTANT DE VOL', `Fumigène orange à gauche : c'est le camion sono, c'est festif. Ne me le signale pas comme un signe.`),
      ], [`Un fumigène de couleur festif part du camion sono`]),
    ph('signes', `Cinq signes à lire`,
      `Le précortège s'engage sur le boulevard du Temple, en avant de la banderole. Les signes sont là pour qui sait les lire : un fumigène noir, des parapluies ouverts sans pluie, des gens qui se changent derrière, une banderole renforcée, du mobilier qu'on déplace. Trois signalements justes sont attendus avant le premier jet ; un simple vêtement noir n'en est pas un.`,
      OBJ('o1'), [
        rad('MISTRAL', 'ICARE', `Qu'est-ce que vous voyez devant la banderole ? Je n'ai que des rapports de sections, rien de précis.`),
        voix('ASSISTANT DE VOL', `Parapluies, là. Il ne pleut pas. Et derrière, ils sortent des affaires des sacs.`),
      ], [`Des parapluies s'ouvrent au-dessus d'un groupe qui se change`, `Des pavés sont descellés à l'angle du boulevard`, `Une averse fait ouvrir des parapluies dans tout le cortège`]),
    ph('bloc', `Donner un contour au bloc`,
      `Les signes sont signalés. Maintenant le bloc existe : une centaine de silhouettes en noir, serrées derrière une banderole renforcée, sur le boulevard du Temple, à cent cinquante mètres de la ligne. Le commandant veut un contour, pas une impression : où il commence, où il finit, combien, et ce qui le sépare des familles.`,
      OBJ('o2'), [
        rad('MISTRAL', 'ICARE', `Désignez-moi le bloc : position, volume, distance à ma ligne, distance au cortège déclaré. J'en ai besoin pour décider.`),
        rad('MISTRAL 2', 'ICARE', `Je vois des barrières tirées en travers devant moi. Vous confirmez d'en haut ?`),
      ], [`Des barrières de chantier sont tirées en travers de la chaussée`, `La batterie passe sous trente pour cent`]),
    ph('marques', `Marquer cinq individus, pas un de plus`,
      `Le bloc est désigné et le commandant a ses cartes en main. Les premiers projectiles partent sur le boulevard du Temple ; à vous de marquer, cinq individus au plus, ceux dont vous avez vu le geste : le marteau sur la vitrine, la bouteille lancée. Marquer une silhouette parce qu'elle est en noir, c'est envoyer une colonne sur quelqu'un qui n'a rien fait.`,
      T(240), [
        rad('MISTRAL', 'ICARE', `Marquez les auteurs que vous voyez agir. Je les ferai interpeller plus tard, sur vos images.`),
        voix('ASSISTANT DE VOL', `Batterie à dix-huit pour cent. Si on change maintenant, on perd deux minutes d'image. À toi de voir.`),
      ], [`Deux agences bancaires sont attaquées au marteau`, `La batterie doit être changée`, `Un drone privé gêne le vol`]),
    ph('suivi', `Suivre ceux qu'on a marqués`,
      `Le précortège reflue et se défait dans les rues latérales du boulevard du Temple. Ceux que vous avez marqués se changent sous les porches et ressortent en tenue claire ; le drone les suit tant qu'ils restent dans le périmètre de vol, et pas un mètre au-delà.`,
      FIN, [
        rad('MISTRAL', 'ICARE', `Gardez vos marqués en visuel jusqu'à la limite de votre périmètre, puis passez le relais au sol.`),
        rad('FAUCON 1', 'ICARE', `En attente rue du Temple. Donnez-moi un marqué à la fois : tenue actuelle, direction, distance.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Repérer trois signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Désigner le bloc au commandant en moins de deux minutes', 'guider_unite', { target: 'bloc', seconds: 120 }),
    os('o3', 'Ne produire aucune fausse alerte', 'personnalise', { target: 'fausse_alerte', max: 0 }),
    os('o4', 'Rester dans le périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
  ],
  failures: [fail('personnalise', 'Aucun signalement à temps.'), fail('personnalise', 'Vol hors du périmètre autorisé.')],
  randomEvents: ['Un coup de vent déporte le drone', 'Une fausse alerte de parapluies', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Voir avant : le drone transforme les phases calmes en temps utile.',
  tags: ['signes', 'miroir'],
});

export const DRONE_03 = mission({
  ...PILOTE, ...scene(CRS_05), difficulty: 3, chapter: 11, mirrorOf: CRS_05.id, altRoles: ['crs'],
  id: 'drone-03-avant-les-autres',
  title: 'Avant les autres',
  pitch: 'Sur le boulevard Beaumarchais, repérer trois signes avant-coureurs dans le précortège et prévenir la salle avant le premier jet.',
  briefing: [
    `Boulevard Beaumarchais, manifestation déclarée. Votre drone surveille le précortège depuis soixante mètres. Un lanceur de la section est en position. Vous êtes le premier à voir le danger, ce qui vous donne une responsabilité.`,
    `Votre mission est de repérer trois signes avant-coureurs et de prévenir la salle avant le premier jet. Chaque signalement doit comporter le lieu, le nombre et l'attitude des individus concernés.`,
    `Balayez la tête de cortège. Cherchez les changements de tenue, les parapluies, les regroupements. Annoncez au fur et à mesure. Ne vous focalisez pas sur un seul point : le vent tourne et la foule avec lui.`,
    `Un signalement trop tardif ne sert à rien ; un signalement erroné use la confiance de la salle. Prévenez à la voix, sans dramatiser.`,
  ],
  intel: intel(
    'Neuf cents personnes ; un précortège violent isolé.',
    'Une trentaine d\'individus déterminés au nord du boulevard.', ['Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Voler à soixante mètres', 'Annoncer lieu, nombre, attitude', 'Ne pas se focaliser sur un point']),
  phases: [
    ph('tete', `La tête de cortège depuis la Bastille`,
      `Soixante mètres au-dessus du boulevard Beaumarchais. Le cortège déclaré remonte de la place de la Bastille vers le boulevard des Filles du Calvaire ; en dessous, une section de CRS tient sa ligne, un lanceur au second rang. Vous voyez les deux à la fois, et ce qui s'approche de l'une comme de l'autre.`,
      T(150), [
        rad('CENTRAL', 'ICARE', `Surveillance de la tête de cortège, boulevard Beaumarchais. Tout signe avant-coureur m'est signalé dans les TROIS-ZÉRO secondes.`),
        voix('ASSISTANT DE VOL', `Vent d'ouest, trois mètres par seconde, mais il tourne. Regarde les drapeaux : ils ne pointent plus du même côté.`),
      ]),
    ph('sacs-a-dos', `Ce qui sort des sacs`,
      `À hauteur de la rue du Pasteur Wagner, un groupe d'une quarantaine de personnes s'arrête en plein boulevard Beaumarchais. Des sacs à dos passent de main en main ; il en sort des masques, des gants, des objets que la caméra ne nomme pas. Derrière eux, des familles et des poussettes marchent encore sans rien remarquer.`,
      OBJ('o1'), [
        voix('ASSISTANT DE VOL', `Ils sortent des trucs des sacs. Zoome. Ce sont des bouteilles, ou des gourdes ?`),
        rad('MISTRAL 1', 'ICARE', `J'ai un groupe arrêté à CENT mètres devant ma ligne. Qu'est-ce qu'ils font ?`),
      ], [`Un groupe sort du matériel de ses sacs à dos`, `Des parapluies s'ouvrent en tête de cortège`, `Un coup de vent déporte le drone`]),
    ph('premier-jet', `Ce que le lanceur ne voit pas`,
      `Trois signes signalés. Les premières bouteilles partent du groupe vers la ligne, et le commandant sort avec son mégaphone. Au-dessus du boulevard Beaumarchais, vous êtes le seul à voir ce que le lanceur de la section ne voit pas : où sont les familles, où s'arrête le cortège déclaré, et dans quel sens le vent emportera un nuage.`,
      T(180), [
        rad('MISTRAL', 'ICARE', `Je vais sommer. Dites-moi où finit le cortège déclaré et où sont les familles, au mètre près.`),
        rad('MISTRAL 1', 'ICARE', `Mon lanceur est prêt. Zone désignée : carrefour Pasteur Wagner. Y a-t-il des tiers dedans ?`),
      ], [`Jets de bouteilles sur la ligne`, `Une famille traverse la zone que la section va désigner`]),
    ph('nuage', `Le nuage et le vent`,
      `Les grenades tombent en cloche sur le carrefour et le nuage s'étale. Puis le vent tourne : la fumée blanche glisse le long du boulevard Beaumarchais vers la ligne et vers une terrasse restée ouverte. Vous le voyez dix secondes avant ceux qui sont dessous.`,
      FOULE('dispersion'), [
        voix('ASSISTANT DE VOL', `Le nuage revient sur les collègues. Et il y a du monde en terrasse, à droite. Préviens !`),
        rad('MISTRAL', 'ICARE', `Où part mon gaz ? Je ne vois plus rien depuis le sol.`),
      ], [`Le vent tourne et ramène le nuage sur la ligne`, `La batterie baisse vite`]),
    ph('reflux', `Suivre le reflux jusqu'à la limite`,
      `Le groupe reflue vers la place de la Bastille et se disloque. Le drone le suit jusqu'au bord de son périmètre de vol, puis fait demi-tour au-dessus du boulevard Beaumarchais : ce que vous avez signalé, et quand, figure seconde par seconde dans le journal de la salle.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Fin de mission. Vos signalements sont horodatés : ils seront comparés à l'heure du premier jet.`),
        voix('ASSISTANT DE VOL', `Batterie à quinze. On rentre, on pose, et on relit la bande ensemble.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Signaler trois signes avant-coureurs avant le premier jet', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Prévenir la salle en moins de trente secondes après chaque repérage', 'guider_unite', { target: 'salle', seconds: 30 }),
    os('o3', 'Ne produire aucune fausse alerte', 'personnalise', { target: 'fausse_alerte', max: 0 }),
    os('o4', 'Suivre le groupe jusqu\'à sa dispersion', 'guider_unite', { target: 'groupe' }),
  ],
  failures: [fail('personnalise', 'Aucun signalement à temps.'), fail('personnalise', 'Vol hors du périmètre autorisé.')],
  randomEvents: ['Une fausse alerte', 'Un coup de vent', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Le drone est l\'œil qui voit avant les autres.',
  tags: ['signes', 'miroir'],
});

export const DRONE_04 = mission({
  ...PILOTE, ...scene(BRAVM_02), difficulty: 4, chapter: 11, mirrorOf: BRAVM_02.id, altRoles: ['bravm'],
  id: 'drone-04-fil-d-ariane',
  title: 'Fil d\'Ariane',
  pitch: 'Guider une colonne de motos vers un groupe mobile à travers les passages et les arcades, sans perdre le contact visuel plus de dix secondes.',
  briefing: [
    `Boulevard Montmartre, la nuit. Un cortège sauvage d'environ quatre-vingts personnes remonte les Grands Boulevards en brisant des vitrines. La BRAV-M le suit en colonne de six binômes. Votre drone est le seul à voir par-dessus les toits.`,
    `Votre mission est de guider la colonne de motos vers le groupe mobile par l'itinéraire le plus rapide, de ne jamais perdre le contact visuel plus de dix secondes et de désigner sans erreur les trois cibles.`,
    `Volez à cinquante mètres. Annoncez les carrefours : « Groupe au carrefour, trente mètres devant vous. » Utilisez le marquage pour désigner. Prévenez la colonne des impasses et des obstacles. Suivez les ruelles qu'elle ne voit pas.`,
    `Une désignation erronée envoie la colonne sur un innocent. La nuit réduit votre vision : activez la caméra thermique à la demande. Le drone vole dans le périmètre autorisé.`,
  ],
  intel: intel(
    'Quatre-vingts personnes en groupe mobile ; trois cibles identifiées.',
    'Une soixantaine d\'individus encagoulés.', ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'],
    ['Voler à cinquante mètres', 'Désigner avec le marquage', 'Prévenir des impasses']),
  phases: [
    ph('par-dessus-les-toits', `Par-dessus les toits des boulevards`,
      `Cinquante mètres au-dessus du boulevard Montmartre, de nuit. Quatre-vingts silhouettes en noir remontent vers l'ouest en étoilant des vitrines ; cinquante mètres derrière, six motos en colonne. Les motards ne voient que des dos et des façades : vous seul voyez les rues latérales, les passages couverts, et ce qui les attend au prochain carrefour.`,
      T(120), [
        rad('FAUCON 1', 'ICARE', `On les suit à CINQ-ZÉRO mètres. Annoncez-moi leur direction à chaque carrefour, et ce qu'il y a devant eux.`),
        voix('ASSISTANT DE VOL', `Passe en thermique, on y verra mieux. Les vitrines éclairées nous brûlent l'image.`),
      ], [`Un feu de poubelle masque la vue`]),
    ph('guidage', `La voix dans l'oreillette des motards`,
      `La colonne décroche pour prendre de l'avance par la rue du Quatre Septembre, parallèle aux boulevards. À vous de la guider : deuxième à droite, quatre-vingts mètres, attention au sens interdit. Le groupe, lui, s'engouffre dans le passage des Panoramas et disparaît dix secondes sous la verrière.`,
      OBJ('o1'), [
        rad('FAUCON 1', 'ICARE', `Je suis rue du Quatre Septembre. Où sont-ils ? Donnez-moi la prochaine à droite qui ressort devant eux.`),
        voix('ASSISTANT DE VOL', `Tu les as perdus sous la verrière. Reste sur la sortie, ils vont ressortir de l'autre côté.`),
      ], [`Le groupe disparaît dans un passage couvert`, `Une impasse bloque la colonne`]),
    ph('trois-cibles', `Trois cibles, sans erreur`,
      `La colonne est devant le groupe, pied à terre, boulevard des Italiens. Trois individus viennent de mettre le feu à un conteneur ; l'un d'eux passe sous un porche et en ressort avec une autre veste. Le sac, lui, est le même, et un passant porte exactement le même. Une désignation erronée envoie six policiers sur un innocent.`,
      OBJ('o2'), [
        rad('FAUCON 2', 'ICARE', `Je suis à pied, à TROIS-ZÉRO mètres du groupe. Désignez-moi les auteurs : tenue, position, direction.`),
        voix('ASSISTANT DE VOL', `Deux sacs kaki, à trois mètres l'un de l'autre. Lequel est le bon ? Ne dis rien tant que tu n'es pas sûr.`),
      ], [`Une cible change de veste sous un porche`, `Deux personnes portent le même sac`]),
    ph('limite', `La limite du périmètre`,
      `Trois désignations justes. Ce qui reste du cortège sauvage file vers la rue de la Paix, et la limite de votre périmètre de vol coupe la place de l'Opéra en deux. Au-delà, le drone n'a plus le droit de suivre : il faut passer le relais au sol, avec une description assez précise pour que les motards n'aient plus besoin de vous.`,
      T(150), [
        rad('FAUCON 1', 'ICARE', `Ils partent vers la rue de la Paix. Vous les gardez ?`),
        rad('CENTRAL', 'ICARE', `Rappel : votre périmètre s'arrête à la place de l'Opéra.`, 'T'),
      ], [`Le groupe sort du périmètre de vol`, `La batterie baisse vite`]),
    ph('relais-au-sol', `Le relais au sol`,
      `Le drone s'immobilise à la verticale de la limite, au-dessus de la place de l'Opéra, et regarde le groupe s'éloigner sans lui. Sur la fréquence, les motards répètent votre dernière description. La nuit, c'est ainsi que finit un guidage : quelqu'un d'autre voit à votre place.`,
      FIN, [
        rad('FAUCON 1', 'ICARE', `Relais pris à la limite. On continue à vue, sans vous.`, 'T'),
        voix('ASSISTANT DE VOL', `Batterie à douze. On rentre au point de pose, je prépare la suivante.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Guider la colonne jusqu\'au groupe sans perdre le contact plus de dix secondes', 'guider_unite', { target: 'colonne_bravm', seconds: 10 }),
    ob('o2', 'Désigner trois cibles sans erreur', 'reperer_signaux', { count: 3 }),
    os('o3', 'Prévenir la colonne des impasses', 'personnalise', { target: 'impasse', count: 2 }),
    os('o4', 'Rester dans le périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
  ],
  failures: [fail('personnalise', 'Désignation erronée.'), fail('personnalise', 'Contact visuel perdu plus de trente secondes.', 30)],
  randomEvents: ['Une impasse bloque la colonne', 'Un feu de poubelle masque la vue', 'La batterie baisse vite', 'Un drone privé gêne le vol'],
  unique: 'Un fil d\'Ariane aérien : le drone est le guide de la colonne dans le labyrinthe.',
  tags: ['guidage', 'miroir', 'nuit'],
});

export const DRONE_05 = mission({
  ...PILOTE, type: 'emeute_nocturne', difficulty: 4, chapter: 11,
  id: 'drone-05-douze-foyers',
  title: 'Douze foyers',
  pitch: 'La nuit, douze foyers à l\'infrarouge : les compter, les hiérarchiser et orienter les secours.',
  briefing: [
    `Rue Saint-Antoine, minuit. Douze foyers de feu sont allumés dans un rayon de quatre cents mètres : poubelles, scooters, barricades, une camionnette. La fumée est épaisse. Les pompiers hésitent à entrer. Votre drone est équipé d'une caméra thermique.`,
    `Votre mission est de localiser tous les foyers, de les hiérarchiser par danger et d'orienter les pompiers et le canon à eau vers les plus urgents, en évitant les zones occupées par des groupes violents.`,
    `Survolez à quatre-vingts mètres. Utilisez la caméra thermique. Marquez les foyers par ordre de danger : camionnette, scooters, barricade, poubelles. Annoncez la fumée et la direction du vent. Signalez les groupes à éviter.`,
    `Ne confondez pas un foyer avec un groupe de personnes : la caméra thermique les montre tous les deux. Préférez l'identification visuelle avant désignation aux secours. La batterie est limitée à vingt minutes.`,
  ],
  place: 'Rue Saint-Antoine', timeOfDay: 0, weather: 'brouillard', windFrom: 240, windSpeed: 2,
  crowd: crowd(300, '', 0.6, 0.7, 0.3, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Rue Saint-Antoine', 'Boulevard Henri IV', 'Place de la Bastille'], 0.1),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 3, samu: 1 }),
  intel: intel(
    'Trois cents personnes dans la fumée ; douze foyers actifs.',
    'Une soixantaine d\'individus déterminés autour des foyers.', ['Rue Saint-Antoine', 'Boulevard Henri IV'],
    ['Hiérarchiser les foyers', 'Utiliser la caméra thermique', 'Signaler le vent']),
  phases: [
    ph('inventaire', `Douze taches blanches`,
      `Minuit, quatre-vingts mètres au-dessus de la rue Saint-Antoine. En thermique, le quartier est une carte grise piquée de taches blanches : poubelles, scooters, barricades, une camionnette. Douze foyers dans un rayon de quatre cents mètres, à localiser et à marquer un par un ; une tache blanche peut aussi être un groupe de personnes serrées.`,
      OBJ('o1'), [
        rad('CENTRAL', 'ICARE', `Les pompiers hésitent à s'engager. Il me faut la carte des foyers : position, nature, ce qui est menacé.`),
        voix('ASSISTANT DE VOL', `Celui-là, c'est un brasero de terrasse, pas un feu. Regarde la forme avant de marquer.`),
      ], [`Un brasero de terrasse est pris pour un foyer`, `Un nouveau foyer s'allume`, `La fumée masque la caméra`]),
    ph('classement', `Classer par danger`,
      `Douze foyers marqués. Tous ne se valent pas : une poubelle isolée au milieu de la chaussée peut brûler seule ; la camionnette garée sous un arbre, contre une façade du boulevard Henri IV, ne le peut pas. Les trois plus dangereux d'abord, avec pour chacun la direction du vent et celle de la fumée.`,
      OBJ('o2'), [
        rad('SAPEUR 1', 'ICARE', `J'ai trois engins. Donnez-moi vos trois priorités, dans l'ordre, avec ce qu'il y a autour.`),
        voix('ASSISTANT DE VOL', `Vent du sud-ouest, deux mètres par seconde. La fumée de la camionnette part sur les immeubles d'en face.`),
      ], [`Une camionnette brûle sous un arbre, contre une façade`, `Un tir de feu d'artifice vise le drone`]),
    ph('orientation', `Trois engins, trois itinéraires`,
      `Les priorités sont données. Trois fourgons de pompiers s'engagent depuis la place de la Bastille, chacun avec son escorte ; depuis le sol, ils ne voient ni la barricade qui barre la rue des Tournelles ni le groupe qui les attend derrière. Vous leur donnez l'itinéraire, rue par rue, et les groupes à éviter.`,
      T(300), [
        rad('SAPEUR 2', 'ICARE', `Je m'engage rue Saint-Antoine. Qu'est-ce que j'ai devant moi ?`),
        rad('MISTRAL 2', 'ICARE', `J'escorte SAPEUR TROIS. Groupe hostile signalé sur notre route : confirmez position et volume.`),
      ], [`Une barricade invisible depuis le sol barre un itinéraire`, `Un groupe attend les pompiers derrière un angle`]),
    ph('verification', `Vérifier ce qui est froid`,
      `Les lances travaillent le long de la rue Saint-Antoine. Sur l'écran, les taches blanches pâlissent l'une après l'autre ; certaines repartent, là où une batterie ou un pneu couve encore. En thermique, froid veut dire gris : vous repassez sur chacun des douze, et vous le dites.`,
      FOULE('dispersion'), [
        rad('SAPEUR 1', 'ICARE', `Foyer de la camionnette : je crois l'avoir. Dites-moi d'en haut s'il reste un point chaud.`),
        voix('ASSISTANT DE VOL', `Le numéro sept reblanchit. Une batterie, sûrement. Signale-le.`),
      ], [`Un foyer repart après le passage des pompiers`, `La batterie baisse vite`]),
    ph('dernier-passage', `Le dernier passage en thermique`,
      `Les groupes quittent le quartier et la rue Saint-Antoine se vide. Dernier passage en thermique, de la place de la Bastille à la station Saint-Paul : il reste des points tièdes, des carcasses, des pompiers qui roulent leurs tuyaux. Le drone rentre avec ce qu'il lui reste de batterie.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Dernier passage, puis posez. Transmettez la carte finale des foyers, avec l'heure de chaque marquage.`),
        rad('SAPEUR 1', 'ICARE', `On roule les tuyaux. Gardez-nous à l'œil jusqu'au départ du dernier engin.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Localiser et marquer douze foyers', 'reperer_signaux', { count: 12 }),
    ob('o2', 'Hiérarchiser les trois foyers les plus dangereux', 'guider_unite', { target: 'foyer', count: 3 }),
    os('o3', 'Orienter les pompiers sans les exposer', 'proteger_site', { target: 'pompiers' }),
    os('o4', 'Signaler la direction du vent', 'personnalise', { target: 'vent' }),
  ],
  failures: [fail('personnalise', 'Un foyer dangereux n\'est pas signalé.'), fail('victime_non_secourue', 'Un pompier est exposé faute de désignation.')],
  randomEvents: ['Un nouveau foyer s\'allume', 'La batterie baisse vite', 'Un tir de feu d\'artifice vers le drone', 'La fumée masque la caméra'],
  unique: 'Voir à travers la fumée : l\'infrarouge est le seul regard utile.',
  tags: ['nuit', 'thermique', 'feux'],
});

export const DRONE_06 = mission({
  ...PILOTE, type: 'evenement_festif', difficulty: 3, chapter: 11,
  id: 'drone-06-densite-critique',
  title: 'Densité critique',
  pitch: 'Au Champ-de-Mars, une foule dense, des issues qui se ferment : repérer la compression avant la bousculade.',
  briefing: [
    `Champ-de-Mars, soir de feu d'artifice. Trois mille personnes sont massées sur les pelouses, face à la Tour Eiffel. Des issues sont fermées par des barrières. Une sortie du métro déverse une nouvelle vague. La densité devient inquiétante.`,
    `Votre mission est de repérer les zones de densité critique, supérieure à quatre personnes au mètre carré, de les signaler à la salle, de guider les secours et d'orienter la foule vers les issues ouvertes.`,
    `Volez à quatre-vingts mètres. Mesurez la densité par carré. Annoncez les compressions. Proposez des ouvertures de barrières. Guidez les ambulances. Annoncez les issues libres.`,
    `Une bousculade dans une foule dense est une catastrophe. Ne perdez jamais de vue les zones rouges. Le drone ne vole pas au-dessus de la foule à moins de cinquante mètres.`,
  ],
  place: 'Champ-de-Mars', timeOfDay: 22, weather: 'clair', windFrom: 250, windSpeed: 2,
  crowd: crowd(3000, '', 0.2, 0.4, 0.01, { fetards: 0.5, familles: 0.2, curieux: 0.3 },
    ['Champ-de-Mars', 'Avenue de la Bourdonnais', 'Quai Branly'], 0.6),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 2, samu: 2 }),
  intel: intel(
    'Trois mille personnes ; densité forte sous la Tour Eiffel.',
    'Aucun radical.', ['Champ-de-Mars', 'Avenue de la Bourdonnais', 'Quai Branly'],
    ['Mesurer la densité par carré', 'Annoncer les issues libres', 'Guider les secours']),
  phases: [
    ph('carte-de-densite', `Vert, orange, rouge`,
      `Vingt-deux heures, quatre-vingts mètres au-dessus du Champ-de-Mars. Trois mille personnes attendent le feu d'artifice sur les pelouses, face à la tour Eiffel. Sur l'écran, la foule est une carte : vert sous deux personnes au mètre carré, orange jusqu'à quatre, rouge au-delà. Pour l'instant, tout est vert et orange.`,
      T(200), [
        rad('CENTRAL', 'ICARE', `Surveillance de densité sur le Champ-de-Mars. Toute zone rouge m'est signalée dans la minute, avec l'issue la plus proche.`),
        voix('ASSISTANT DE VOL', `On reste à quatre-vingts mètres. Jamais au-dessus des têtes à moins de cinquante.`),
      ], [`Un drone civil non autorisé vole au-dessus des pelouses`]),
    ph('vague', `La vague de l'avenue de la Bourdonnais`,
      `Une rame vient d'arriver : par l'avenue de la Bourdonnais, une vague de plusieurs centaines de personnes entre sur le Champ-de-Mars par un passage que des barrières resserrent. L'orange vire au rouge à l'entrée, puis au pied d'un écran géant, puis contre une barrière qui plie.`,
      OBJ('o1'), [
        voix('ASSISTANT DE VOL', `Rouge à l'entrée Bourdonnais. Et là, contre la barrière, ils sont à cinq ou six au mètre carré.`),
        rad('MISTRAL 1', 'ICARE', `Je suis à l'entrée Bourdonnais, je ne vois que des dos. C'est grave, d'en haut ?`),
      ], [`Une vague sort du métro par l'avenue de la Bourdonnais`, `Une barrière cède sous la pression`, `Un malaise dans la zone la plus dense`]),
    ph('issue', `Proposer une issue`,
      `Les zones rouges sont signalées. Elles ne se videront pas seules : il faut ouvrir. Au-dessus du Champ-de-Mars, on voit ce que personne ne voit au sol : la barrière qu'on peut retirer, l'allée vide derrière elle, le chemin que pourrait prendre une ambulance. Proposer une ouverture, c'est donner une direction à trois mille personnes.`,
      OBJ('o2'), [
        rad('CENTRAL', 'ICARE', `Quelle issue me proposez-vous ? Je peux faire retirer des barrières : dites-moi lesquelles, et vers où ça débouche.`),
        rad('SANTÉ 2', 'ICARE', `J'ai un malaise à prendre au milieu des pelouses. Par où j'entre sans traverser la foule ?`),
      ], [`Un enfant perdu est signalé près des barrières`, `La fumée du feu d'artifice gêne la caméra`]),
    ph('bouquet', `Le bouquet final, puis tout le monde part`,
      `Le feu d'artifice commence : trois mille visages levés, plus personne ne regarde où il met les pieds. Au bouquet final, tout le monde voudra quitter le Champ-de-Mars en même temps, par le quai Branly et le pont d'Iéna. C'est là que se formeront les prochaines zones rouges, et vous les verrez naître.`,
      FOULE('dispersion'), [
        rad('CENTRAL', 'ICARE', `Fin du feu d'artifice dans DEUX minutes. Annoncez-moi les flux de sortie et les goulots dès qu'ils se forment.`),
        voix('ASSISTANT DE VOL', `Fausse alerte côté tour : quelqu'un a crié, ça court sur vingt mètres. Regarde si ça se propage.`),
      ], [`Un mouvement de foule part d'une fausse alerte`, `La batterie baisse vite`]),
    ph('ecoulement', `L'écoulement vers le pont`,
      `La foule s'écoule du Champ-de-Mars vers le quai Branly et le pont d'Iéna, en rubans orange qui s'amincissent. Dernier tour au-dessus des pelouses, à la recherche de ce qui reste : un enfant seul, une personne assise, un sac. Puis le retour, batterie presque vide.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Dispersion en cours. Dernier passage sur les pelouses, puis posez. Rendez compte de vos signalements.`),
        rad('MISTRAL 1', 'ICARE', `L'enfant signalé tout à l'heure : vous l'avez encore à l'image ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Signaler toutes les zones à plus de quatre personnes au mètre carré', 'reperer_signaux', { count: 3 }),
    ob('o2', 'Proposer l\'ouverture d\'au moins une issue', 'guider_unite', { target: 'issue', count: 1 }),
    os('o3', 'Guider les ambulances vers les malaises', 'secourir', { target: 'malaise', count: 2 }),
    os('o4', 'Ne pas voler à moins de cinquante mètres de la foule', 'personnalise', { target: 'distance_foule' }),
  ],
  failures: [fail('trop_de_blesses', 'Bousculade grave.', 10), fail('personnalise', 'Vol sur la foule à basse altitude.')],
  randomEvents: ['Une barrière cède', 'Un malaise dans la foule', 'Un drone privé gêne le vol', 'La batterie baisse vite'],
  unique: 'La densité est invisible à pied : le drone est le seul à la voir à temps.',
  tags: ['densite', 'fete'],
});

export const DRONE_07 = mission({
  ...PILOTE, type: 'manifestation_interdite', difficulty: 4, chapter: 11,
  id: 'drone-07-hors-perimetre',
  title: 'Hors périmètre',
  pitch: 'L\'action se déplace hors du polygone de vol autorisé : continuer à renseigner depuis l\'intérieur, sans franchir la limite.',
  briefing: [
    `Place de la République, manifestation interdite. Un arrêté préfectoral limite le vol à un polygone de quatre cents mètres. Au bout d'un quart d'heure, un groupe violent quitte la place et s'engage sur le boulevard de Magenta, hors du périmètre.`,
    `Votre mission est de continuer à renseigner la salle sans franchir la limite : rester à l'intérieur, annoncer ce que vous voyez, signaler le départ du groupe, demander l'extension du périmètre si nécessaire.`,
    `Surveillez la carte : la limite apparaît en rouge. Approchez-vous du bord sans le franchir. Annoncez : « Groupe sort de mon périmètre, direction nord. » Demandez une autorisation d'extension à la salle.`,
    `Un drone hors périmètre est illégal : c'est la faute la plus grave. Ne cédez pas à la pression de la salle. Une demande d'extension doit être formelle, par écrit et horodatée.`,
  ],
  place: 'Place de la République', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(700, 'libertes', 0.5, 0.65, 0.15, { gilets_jaunes: 0.3, black_bloc: 0.15, militants: 0.2, curieux: 0.35 },
    ['Place de la République', 'Boulevard de Magenta'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Sept cents personnes ; un groupe violent quitte la place après un quart d\'heure.',
    'Une centaine d\'individus déterminés.', ['Place de la République', 'Boulevard de Magenta'],
    ['Surveiller la limite en rouge', 'Annoncer le départ du groupe', 'Demander l\'extension par écrit']),
  phases: [
    ph('polygone', `Un polygone de quatre cents mètres`,
      `Seize heures, au-dessus de la place de la République. L'arrêté préfectoral dessine un polygone de quatre cents mètres autour de la statue ; sa limite nord, en rouge sur l'écran, coupe le boulevard de Magenta à la hauteur de la rue du Château d'Eau. Sur la place, sept cents personnes, dont un groupe en noir qui regarde vers le nord.`,
      T(200), [
        rad('CENTRAL', 'ICARE', `Surveillance de la place de la République. Suivez en priorité le groupe en tenue noire, UN-ZÉRO-ZÉRO individus.`),
        voix('ASSISTANT DE VOL', `Limite nord à cent vingt mètres. Je te l'annonce tous les vingt mètres quand on s'en approche.`),
      ], [`Une rafale de vent pousse le drone vers la limite`]),
    ph('depart-du-groupe', `Le groupe part vers le nord`,
      `Le groupe en noir quitte la place d'un bloc et s'engage sur le boulevard de Magenta, au pas de course. Il renverse des poubelles, brise un abribus. Dans trente secondes, il aura passé la limite de votre périmètre ; ce que vous pouvez encore faire, c'est le dire, avec la direction, l'allure et le nombre.`,
      OBJ('o2'), [
        voix('ASSISTANT DE VOL', `Ils sortent par le nord. Quatre-vingts mètres avant la limite. Soixante.`),
        rad('MISTRAL', 'ICARE', `Où va le groupe noir ? Je n'ai personne sur le boulevard de Magenta.`),
      ], [`Un groupe violent quitte la place par le boulevard de Magenta`, `Un abribus est brisé`]),
    ph('pression', `La salle demande de jeter un œil`,
      `Le départ est signalé. Le drone est immobile à la verticale de la limite, et le groupe rapetisse sur le boulevard de Magenta. Sur la fréquence, la salle insiste : cent mètres de plus, trente secondes, personne n'en saura rien. L'arrêté, lui, ne connaît pas les trente secondes.`,
      T(180), [
        rad('CENTRAL', 'ICARE', `Suivez-les encore un peu. CENT mètres, TROIS-ZÉRO secondes : j'ai besoin de savoir où ils tournent.`),
        voix('ASSISTANT DE VOL', `Si on passe la ligne, c'est dans le journal de vol, à la seconde. Et c'est toi qui tiens les manettes.`),
      ], [`La salle réclame de suivre le groupe hors du périmètre`, `Un témoin filme le drone à la limite de la zone`]),
    ph('extension', `Demander l'extension, par écrit`,
      `Il existe une voie régulière : demander l'extension du périmètre, formellement, par un message écrit et horodaté, et attendre la réponse. En attendant, le drone reste dans son polygone et donne ce qu'il peut donner de là : le dernier cap du groupe, vu de loin, au zoom, sans filmer les fenêtres du boulevard de Magenta.`,
      T(200), [
        rad('CENTRAL', 'ICARE', `Toute demande d'extension passe par l'autorité préfectorale. Délai inconnu. En attendant, restez dans votre périmètre.`),
        rad('FAUCON 1', 'ICARE', `Je pars sur le boulevard de Magenta. Dernière position connue du groupe ?`),
      ], [`La batterie baisse vite`, `Un drone privé gêne le vol`]),
    ph('journal-de-vol', `Ce que dira le journal de vol`,
      `Le groupe a disparu vers la gare de l'Est et les motos ont pris le relais au sol. Sur la place de la République, le rassemblement se défait. Le drone rentre ; son journal de vol sera relu demain, trace par trace, et la limite rouge y figurera, avec tout ce qui s'en est approché.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Fin de vol. Votre journal sera versé au dossier, trace par trace.`),
        voix('ASSISTANT DE VOL', `On pose. Pour ce que ça vaut : je mettrai dans mon compte rendu ce que tu as décidé, et pourquoi.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Ne jamais franchir la limite du périmètre de vol', 'personnalise', { target: 'perimetre_vol' }),
    ob('o2', 'Signaler le départ du groupe à la salle', 'reperer_signaux', { count: 1 }),
    os('o3', 'Demander l\'extension par écrit', 'personnalise', { target: 'extension_perimetre', count: 1 }),
    os('o4', 'Garder le contact visuel jusqu\'à la limite', 'guider_unite', { target: 'groupe' }),
  ],
  failures: [fail('personnalise', 'Vol hors du périmètre autorisé : faute grave.'), fail('revocation', 'Vol illégal répété.')],
  randomEvents: ['La salle réclame de suivre le groupe', 'Un drone privé gêne le vol', 'La batterie baisse vite', 'Rafale de vent'],
  unique: 'Le droit limite l\'œil : la loi fixe la frontière du regard.',
  tags: ['perimetre', 'droit'],
});

export const DRONE_08 = mission({
  ...PILOTE, type: 'catastrophe', difficulty: 4, chapter: 11,
  id: 'drone-08-thermique',
  title: 'Thermique',
  pitch: 'Dans la fumée, la nuit, retrouver un blessé au sol et trois foyers, et guider les secours.',
  briefing: [
    `Quai de Gesvres, à deux heures du matin. Le feu d'une barricade a gagné un entrepôt de livraison. La fumée est noire et dense. Un manifestant s'est effondré au sol, introuvable à l'œil. Trois foyers actifs menacent les immeubles voisins.`,
    `Votre mission est de retrouver le blessé en moins de quatre minutes grâce à la caméra thermique, de localiser les trois foyers et de guider les secours en évitant les zones à risque d'explosion.`,
    `Volez à quarante mètres. Activez le thermique. Balayez en zigzag. Un point chaud isolé au sol est un blessé. Annoncez et marquez. Guidez le SAMU par la voie la plus courte. Signalez les bouteilles de gaz.`,
    `Ne confondez pas un foyer et un blessé : le blessé a une silhouette. La fumée peut gêner l'image : volez plus bas si nécessaire. Respectez la distance de sécurité de trente mètres.`,
  ],
  place: 'Quai de Gesvres', timeOfDay: 2, weather: 'brouillard', windFrom: 200, windSpeed: 1,
  crowd: crowd(80, '', 0.4, 0.4, 0.1, { curieux: 0.6, fetards: 0.4 },
    ['Quai de Gesvres', 'Pont d\'Arcole'], 0.05),
  forces: forces({ drone: true, pompiers: 3, samu: 1 }),
  intel: intel(
    'Quatre-vingts personnes dans la fumée ; un blessé introuvable.',
    'Aucun radical.', ['Quai de Gesvres', 'Pont d\'Arcole'],
    ['Utiliser le thermique', 'Balayer en zigzag', 'Signaler les bouteilles de gaz']),
  phases: [
    ph('zigzag', `Quatre minutes pour un point chaud`,
      `Deux heures du matin, quarante mètres au-dessus du quai de Gesvres. Le feu d'une barricade a gagné un entrepôt de livraison et la fumée noire couche sur le quai. Quelque part là-dessous, un homme s'est effondré et personne ne le voit. En thermique, un foyer est une flaque blanche ; un blessé a des épaules et des jambes.`,
      OBJ('o1'), [
        rad('SAPEUR 1', 'ICARE', `On nous signale un homme à terre dans la fumée, quai de Gesvres. Mes gars ne le trouvent pas. Vous avez QUATRE minutes avant que ça devienne grave.`),
        voix('ASSISTANT DE VOL', `Balaye en zigzag, du parapet vers les façades. Un point chaud isolé, allongé : c'est lui.`),
      ], [`La fumée masque la caméra`, `Un curieux allongé derrière un muret est pris pour le blessé`]),
    ph('guidage-du-brancard', `Guider le brancard`,
      `Il est là : une silhouette couchée entre deux voitures, sur le quai de Gesvres, à trente mètres de l'entrepôt. Les secours sont à cent mètres et marchent dans le noir, masque sur le visage. La voie la plus courte longe le parapet ; l'autre passe devant une porte de l'entrepôt où la caméra montre trois bouteilles de gaz.`,
      T(180), [
        rad('SANTÉ 1', 'ICARE', `Je pars à pied avec le brancard. Guidez-moi : je ne vois pas à trois mètres.`),
        voix('ASSISTANT DE VOL', `Trois cylindres chauds devant la porte de l'entrepôt. Des bouteilles de gaz. Fais-les passer par le parapet.`),
      ], [`Des bouteilles de gaz chauffent devant l'entrepôt`, `Un second blessé apparaît près du pont d'Arcole`]),
    ph('trois-foyers', `Trois foyers et des façades`,
      `Le brancard repart vers le pont d'Arcole. Reste l'incendie : trois foyers actifs, dont un lèche déjà le mur d'un immeuble d'habitation du quai de Gesvres. Les pompiers veulent savoir par où il progresse, ce qui chauffe derrière les murs, et où ne pas mettre un homme.`,
      OBJ('o2'), [
        rad('SAPEUR 1', 'ICARE', `Localisez-moi les foyers actifs et dites-moi lequel menace les habitations. Et vos bouteilles de gaz : où exactement ?`),
        voix('ASSISTANT DE VOL', `Distance de sécurité : trente mètres des bouteilles. On recule et on zoome.`),
      ], [`Une bouteille de gaz explose`, `La batterie baisse vite`]),
    ph('veille', `Jusqu'à ce que l'écran refroidisse`,
      `Les trois foyers sont localisés et les lances les attaquent l'un après l'autre. Sur l'écran, le blanc recule ; au-dessus du quai de Gesvres, le brouillard reprend la place de la fumée. Le drone reste en veille tant qu'il a de la batterie : un point chaud qui repart, ici, c'est un mur qui cède.`,
      FIN, [
        rad('SAPEUR 1', 'ICARE', `Restez au-dessus de nous tant que vous pouvez. Signalez-moi toute reprise.`),
        rad('SANTÉ 1', 'ICARE', `Victime chargée dans l'ambulance. Je vous tiens au courant de son état.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Retrouver le blessé en moins de quatre minutes', 'secourir', { target: 'blesse_au_sol', count: 1, seconds: 240 }),
    ob('o2', 'Localiser les trois foyers', 'reperer_signaux', { count: 3 }),
    os('o3', 'Guider le SAMU par la voie la plus courte', 'guider_unite', { target: 'samu' }),
    os('o4', 'Signaler les bouteilles de gaz', 'reperer_signaux', { target: 'gaz', count: 1 }),
  ],
  failures: [fail('victime_non_secourue', 'Le blessé n\'est pas trouvé en quatre minutes.', 240), fail('personnalise', 'Vol dans la zone d\'explosion.')],
  randomEvents: ['Une bouteille de gaz explose', 'La fumée masque la caméra', 'La batterie baisse vite', 'Un second blessé apparaît'],
  unique: 'Un drone sauve une vie : la recherche thermique remplace des dizaines d\'yeux.',
  tags: ['nuit', 'secours', 'thermique'],
});

export const DRONE_09 = mission({
  ...PILOTE, type: 'manifestation_declaree', difficulty: 3, chapter: 11,
  id: 'drone-09-comptage',
  title: 'Comptage',
  pitch: 'De la Bastille à la République, compter le cortège à dix pour cent près, mesurer sa longueur et signaler deux points de compression.',
  briefing: [
    `Boulevard Beaumarchais, un cortège déclaré remonte les boulevards, de la Bastille à la République. Les organisateurs annoncent quinze mille personnes, la préfecture dix mille. Votre drone doit trancher, dans un périmètre qui couvre tout le parcours.`,
    `Votre mission est de compter le cortège à dix pour cent près, de mesurer sa longueur et de signaler deux points de compression. Votre estimation est transmise à la salle, qui la publie.`,
    `Volez à cent mètres. Comptez par blocs de cent personnes sur dix points de repère. Mesurez la longueur par les balises. Calculez la densité moyenne. Signalez les goulots. Annoncez : « Effectif estimé, dix mille. »`,
    `Votre comptage est public : il doit être honnête. Ne cédez pas à la pression de l'un ou l'autre camp. Une erreur supérieure à vingt-cinq pour cent est une faute.`,
  ],
  place: 'Boulevard Beaumarchais', timeOfDay: 15, weather: 'clair', windFrom: 270, windSpeed: 3,
  crowd: crowd(1500, 'pouvoir_achat', 0.2, 0.3, 0.02, { syndical: 0.4, familles: 0.2, retraites: 0.2, etudiants: 0.2 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard des Filles du Calvaire', 'Boulevard du Temple', 'Place de la République'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Dix mille personnes selon la préfecture, quinze mille selon les organisateurs.',
    'Aucun radical.', ['Boulevard Beaumarchais', 'Place de la République'],
    ['Compter par blocs de cent', 'Mesurer la longueur', 'Signaler les goulots']),
  phases: [
    ph('deux-chiffres', `Quinze mille ou dix mille`,
      `Quinze heures, cent mètres au-dessus de la place de la Bastille. Le cortège s'ébranle vers le boulevard Beaumarchais. Les organisateurs annoncent quinze mille personnes, la préfecture dix mille ; le chiffre que vous donnerez sera public, et il n'appartient ni aux uns ni aux autres.`,
      FOULE('cortege'), [
        rad('CENTRAL', 'ICARE', `Comptage du cortège, de la Bastille à la République. Méthode : blocs de UN-ZÉRO-ZÉRO personnes sur UN-ZÉRO points de repère. Je veux une estimation, pas une impression.`),
        voix('ASSISTANT DE VOL', `On ne vole pas au-dessus des têtes : on se décale au-dessus des toits et on compte en biais.`),
      ], [`Un ballon du cortège masque la vue`]),
    ph('dix-reperes', `Dix points de repère`,
      `Le cortège remplit le boulevard Beaumarchais d'un trottoir à l'autre. Dix repères ont été fixés le long du parcours : à chacun, on fige l'image, on compte un bloc, on mesure la longueur entre deux balises, on en tire une densité. La tête n'est pas la queue : elle est serrée, la queue s'étire, et les trottoirs ne sont pas vides.`,
      T(120), [
        voix('ASSISTANT DE VOL', `Repère trois : je compte quatre-vingt-dix dans le carré. Toi ?`),
        rad('LIAISON', 'CENTRAL', `Les organisateurs demandent quel chiffre le drone va donner. Ils disent qu'ils ont leur propre comptage.`),
      ], [`Les organisateurs font pression sur le chiffre`, `Un drone privé gêne le vol`]),
    ph('goulots', `Deux goulots sur le parcours`,
      `Dix repères comptés. À l'entrée du boulevard des Filles du Calvaire, la chaussée se resserre autour d'un chantier et le cortège s'y comprime ; même chose plus loin, à l'approche de la place de la République. Un comptage sert aussi à cela : dire où la foule s'entasse avant que ceux qui sont dedans ne le sentent.`,
      OBJ('o2'), [
        rad('MISTRAL', 'ICARE', `Le cortège ralentit sans raison apparente. Vous voyez un bouchon quelque part ?`),
        voix('ASSISTANT DE VOL', `Regarde la densité au chantier : ça passe de deux à quatre au mètre carré en vingt mètres.`),
      ], [`Un goulot se forme au droit d'un chantier`, `La batterie baisse vite`]),
    ph('chiffre', `Un seul chiffre, et sa marge`,
      `Les deux goulots sont signalés. Reste à produire le chiffre avant que le cortège ne se disperse place de la République : longueur, largeur occupée, densité moyenne, marge d'erreur. La salle le veut rond et tout de suite ; les organisateurs le voudront plus haut, la préfecture plus bas. Vous ne devez à personne autre chose que votre calcul.`,
      FOULE('dispersion'), [
        rad('CENTRAL', 'ICARE', `J'attends votre estimation. La presse appelle. Un chiffre et une marge.`),
        rad('CENTRAL', 'ICARE', `On me dit que DIX MILLE arrangerait tout le monde. Je vous transmets, je ne vous demande rien.`, 'T'),
      ], [`La salle transmet le chiffre que chacun espère`]),
    ph('rapport', `Le chiffre rendu public`,
      `Le cortège se disperse place de la République ; sa queue quitte à peine le boulevard du Temple. Le drone fait un dernier passage pour mesurer la longueur totale, puis rentre. Votre estimation part à la salle avec sa méthode : c'est elle qui sera citée ce soir, et contestée demain.`,
      FIN, [
        rad('CENTRAL', 'ICARE', `Joignez à votre estimation la méthode et les dix images de comptage : elles seront publiées avec le chiffre.`),
        voix('ASSISTANT DE VOL', `Quel que soit le chiffre, quelqu'un dira qu'on a triché. Garde les images.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Estimer l\'effectif à dix pour cent près', 'personnalise', { target: 'comptage', count: 10 }),
    ob('o2', 'Signaler deux points de compression', 'reperer_signaux', { count: 2 }),
    os('o3', 'Mesurer la longueur du cortège', 'personnalise', { target: 'longueur_cortege' }),
    os('o4', 'Ne pas voler à moins de cinquante mètres de la foule', 'personnalise', { target: 'distance_foule' }),
  ],
  failures: [fail('personnalise', 'Écart supérieur à vingt-cinq pour cent.', 25), fail('personnalise', 'Vol hors périmètre.')],
  randomEvents: ['Un goulot au carrefour', 'La batterie baisse vite', 'Un ballon masque la vue', 'Un drone privé gêne le vol'],
  unique: 'Le chiffre est un enjeu : compter honnêtement est une responsabilité.',
  tags: ['comptage', 'declaree'],
});

export const DRONE: MissionDef[] = [
  DRONE_01, DRONE_02, DRONE_03, DRONE_04, DRONE_05, DRONE_06, DRONE_07, DRONE_08, DRONE_09,
];
