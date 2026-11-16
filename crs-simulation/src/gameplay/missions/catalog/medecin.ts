/* =====================================================================================
 * Catalogue — médecin bénévole (« street medic ») : soigner dans la rue, trier, se faire reconnaître
 * des deux côtés. Rôle civil : il ouvre une mission quand sa mission miroir est terminée.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, scene, T, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_06 } from './commandant';
import { CRS_05 } from './crs';

const MED: Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> = { role: 'street_medic', rank: null, poste: null, profile: null };

export const MED_01 = mission({
  ...MED, type: 'formation', duration: 'courte', difficulty: 1, chapter: 13,
  id: 'medecin-01-serum-physiologique',
  title: 'Sérum physiologique',
  pitch: 'Premier réflexe du médecin de rue : rincer quinze personnes en trois minutes pendant une salve, sans s\'exposer plus de vingt secondes d\'affilée.',
  briefing: [
    `Place de la République, un après-midi de manifestation. Un sac de sérum physiologique, des gants, des lunettes et un masque : votre équipement de médecin bénévole d'une association de soins de rue. Un cortège passe, des grenades lacrymogènes tombent à cent mètres.`,
    `Votre mission est de rincer les yeux de quinze personnes en trois minutes, de les orienter vers l'air frais et de ne pas vous exposer plus de vingt secondes d'affilée aux gaz. Vous êtes médecin, pas combattant : votre sécurité est la condition des soins.`,
    `Repérez les personnes qui se frottent les yeux. Approchez-les par le côté du vent. Faites pencher la tête en arrière, rincez de l'intérieur vers l'extérieur de l'œil. Dites : « Ne frottez pas, respirez calmement. » Éloignez-les du nuage.`,
    `Vous ne soignez que ce que vous savez soigner : les cas graves vont au SAMU. Ne retirez jamais vos lunettes et votre masque. Ne touchez pas un visage avec des gants contaminés.`,
  ],
  place: 'Place de la République', timeOfDay: 15.5, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'pouvoir_achat', 0.4, 0.5, 0.1, { syndical: 0.3, etudiants: 0.2, gilets_jaunes: 0.2, curieux: 0.3 },
    ['Place de la République', 'Boulevard Voltaire'], 0.4),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; salve de lacrymogènes sur le boulevard Voltaire.',
    'Une trentaine d\'individus déterminés.', ['Place de la République', 'Boulevard Voltaire'],
    ['Approcher par le côté du vent', 'Ne pas s\'exposer plus de vingt secondes', 'Orienter vers l\'air frais']),
  phases: [
    ph('masque', `Le masque d'abord`,
      `Place de la République, un après-midi de manifestation. À cent mètres, côté boulevard Voltaire, des grenades lacrymogènes viennent de tomber et le nuage dérive vers vous. Avant de soigner qui que ce soit : lunettes étanches, masque, gants, et le sac de sérum physiologique ouvert sur la hanche.`,
      T(25), [
        voix('COÉQUIPIÈRE', `Lunettes, masque, gants. Si tu pleures, tu ne soignes personne. Et tu restes du côté d'où vient le vent.`),
        voix('MANIFESTANTE', `Mes yeux ! Je ne vois plus rien, ça brûle !`),
      ]),
    ph('rincage', `Quinze paires d'yeux`,
      `Ils sortent du nuage un par un, pliés en deux, les mains sur le visage, et s'assoient au pied de la statue de la République. Tête en arrière, de l'intérieur de l'œil vers l'extérieur, huit secondes chacun ; puis on les envoie vers l'air frais, et on passe au suivant sans traîner dans le gaz.`,
      OBJ('o1'), [
        voix('COÉQUIPIÈRE', `Ne frottez pas, respirez calmement ! Dis-le à chacun. Et change de gants dès que tu as touché un visage.`),
        voix('MANIFESTANT', `Moi d'abord ! Ça fait dix minutes que j'attends, lui, il vient d'arriver !`),
      ], [`Un manifestant exige d'être soigné le premier`, `Le vent rabat le nuage vers vous`, `Une personne asthmatique cherche son inhalateur`]),
    ph('paniques', `Deux personnes qui n'arrivent plus à respirer`,
      `Quinze personnes rincées. Deux autres sont assises contre un banc de la place de la République, les yeux propres mais le souffle court : la panique, pas le gaz. Les asseoir, leur parler lentement, compter avec elles ; pendant ce temps vous êtes immobile, et le nuage, lui, ne l'est pas.`,
      T(60), [
        voix('MANIFESTANTE', `Je n'arrive pas à respirer… je n'y arrive pas… je vais mourir ?`),
        voix('COÉQUIPIÈRE', `Fais-la souffler avec toi : quatre secondes, on bloque, quatre secondes. Regarde-la dans les yeux.`),
      ]),
    ph('cafe', `Un poste de soins dans le hall d'un café`,
      `Il faut un endroit où envoyer les suivants : le hall d'un café du boulevard Voltaire, au vent, porte fermée. Le patron hésite sur le seuil, torchon à la main. Un poste de soins, c'est une chaise, de l'eau, et quelqu'un qui accepte que des inconnus aux yeux rouges s'assoient chez lui.`,
      FIN, [
        voix('CAFETIER', `Vous n'allez pas me mettre tout ça chez moi ? J'ai des clients, moi. Bon… dix minutes. Et pas de casse.`),
        voix('COÉQUIPIÈRE', `On note combien on en a vu, et combien on a envoyés au SAMU. C'est ça, le bilan.`),
      ], [`Le cafetier hésite à ouvrir son hall`]),
  ],
  objectives: [
    ob('o1', 'Rincer quinze personnes en trois minutes', 'soigner', { target: 'yeux_gaz', count: 15, seconds: 180 }),
    ob('o2', 'Ne pas vous exposer plus de vingt secondes d\'affilée aux gaz', 'survivre', { seconds: 20 }),
    os('o3', 'Orienter chaque personne vers l\'air frais', 'prevention', { count: 15 }),
  ],
  failures: [fail('joueur_hors_combat', 'Malaise du médecin sous les gaz.'), fail('temps', 'Atelier trop long.', 240)],
  randomEvents: ['Un manifestant refuse le soin', 'Retour de gaz', 'Un asthmatique demande son inhalateur'],
  unique: 'La survie du soignant d\'abord : on ne soigne que si l\'on est en état de le faire.',
  tags: ['formation', 'soins'],
});

export const MED_02 = mission({
  ...MED, ...scene(CRS_05), difficulty: 3, chapter: 13, mirrorOf: CRS_05.id, altRoles: ['crs'],
  id: 'medecin-02-tri-sous-les-gaz',
  title: 'Tri sous les gaz',
  pitch: 'Sur le boulevard Beaumarchais, des blessés autour de vous et un nuage qui revient : trier avant de soigner.',
  briefing: [
    `Boulevard Beaumarchais, la manifestation tourne mal. Les CRS tirent des grenades lacrymogènes en cloche, le vent tourne et le nuage revient sur la foule. Six blessés vous entourent : une femme inconsciente, un homme qui saigne de la tête, quatre intoxiqués. Vous êtes médecin bénévole.`,
    `Votre mission est de trier les blessés selon l'urgence, de traiter d'abord les cas rouges, puis les jaunes, puis les verts, et de transmettre par téléphone un bilan juste aux secours. Vous êtes seul pour l'instant : la décision est à vous.`,
    `Évaluez d'abord : respiration, saignement, conscience. Inconsciente qui respire : position latérale de sécurité. Saignement : compression directe. Intoxiqués : rinçage et air frais. Transmettez le bilan : nombre de blessés, état de chacun, gestes déjà faits. Tenez-vous hors du nuage.`,
    `Un rouge traité en dernier est une faute lourde. Ne vous éloignez pas de votre sac. Les gaz irritent les yeux : portez vos lunettes. Ne déplacez pas sans nécessité un blessé qui a pu se faire mal au dos.`,
  ],
  intel: intel(
    'Neuf cents personnes ; nuage lacrymogène revenant sur le trottoir.',
    'Une trentaine d\'individus déterminés.', ['Boulevard Beaumarchais', 'Rue Amelot'],
    ['Trier avant de soigner', 'Éviter le nuage', 'Transmettre un bilan juste']),
  phases: [
    ph('nuage', `Le nuage revient sur le trottoir`,
      `Boulevard Beaumarchais, côté pair. Les grenades sont tombées en cloche sur le carrefour, puis le vent a tourné : le nuage revient sur la foule. Autour de vous, six personnes à terre ou assises contre une vitrine : une femme qui ne répond pas, un homme la tête en sang, quatre autres qui toussent.`,
      T(60), [
        voix('COÉQUIPIÈRE', `Ceux qui marchent, on les sort d'abord ! Vers la rue Amelot, à l'air !`),
        voix('PROCHE AFFOLÉ', `C'est ma femme ! Elle est tombée d'un coup ! Faites quelque chose !`),
      ], [`Le nuage de gaz revient sur le trottoir`]),
    ph('quinze-secondes', `Quinze secondes par personne`,
      `Quatre questions par victime, quinze secondes pas plus : respire-t-elle, à quel rythme, a-t-elle un pouls au poignet, répond-elle ? Vert pour ceux qui marchent, jaune pour ceux qui peuvent attendre, rouge pour ceux qui ne le peuvent pas. Sur le trottoir du boulevard Beaumarchais, chacun vous regarde comme si vous deviez commencer par lui.`,
      OBJ('o1'), [
        voix('BLESSÉ', `Je saigne, là ! Regardez, je saigne de la tête, occupez-vous de moi !`),
        voix('COÉQUIPIÈRE', `Celle qui ne dit rien, d'abord. Celui qui crie respire.`),
      ], [`Un blessé qui crie réclame la priorité`, `Un projectile tombe près du sac`]),
    ph('rouges', `Les rouges d'abord`,
      `Les six sont triés. Deux rouges : la femme inconsciente, qui respire, à tourner sur le côté ; l'homme dont le cuir chevelu saigne à flots, à comprimer. Les quatre intoxiqués attendront à l'air, plus haut sur le boulevard Beaumarchais, sous l'œil de votre coéquipière ; l'un d'eux, pourtant, respire de plus en plus vite.`,
      OBJ('o2'), [
        voix('COÉQUIPIÈRE', `Le jeune, là : il siffle en respirant. Tu l'avais mis vert ? Regarde-le encore.`),
        voix('PROCHE AFFOLÉ', `Pourquoi vous la tournez comme ça ? Vous êtes médecin, au moins ?`),
      ], [`Un intoxiqué classé vert s'aggrave`, `Retour de gaz par vent tournant`]),
    ph('regroupement', `Soixante mètres jusqu'aux pompiers`,
      `Les deux rouges sont stabilisés. Le point de regroupement des victimes est à soixante mètres, rue Amelot, derrière la ligne de CRS : les sapeurs-pompiers n'avanceront pas plus loin tant que ça lance. Il faut y amener les six, les rouges portés, et transmettre un bilan qui tienne en trois phrases.`,
      T(200), [
        voix('SAPEUR-POMPIER', `Combien, quel état, quels gestes ? Dites-moi les rouges en premier.`),
        voix('CRS', `Médecin ? Passez par la droite, on vous ouvre. Vite, ça reprend derrière vous.`),
      ], [`Les pompiers ne peuvent pas avancer au-delà de la ligne`]),
    ph('carnet', `Six lignes sur un carnet`,
      `Rue Amelot, les ambulances chargent. Sur le boulevard Beaumarchais, le nuage se dissipe et la foule reflue vers la Bastille. Il vous reste un carnet à remplir avant de repartir : six lignes, une par personne, la couleur donnée, l'heure, le geste, et, s'il y a lieu, la couleur corrigée.`,
      FIN, [
        voix('SAPEUR-POMPIER', `On prend les deux graves. Les autres, vous nous les gardez à l'œil dix minutes, on revient.`),
        voix('COÉQUIPIÈRE', `On refait le plein de sérum et on y retourne. Ça va, toi ? Montre tes yeux.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Trier les six blessés par couleur', 'secourir', { target: 'blesse', count: 6 }),
    ob('o2', 'Traiter les cas rouges avant les autres', 'soigner', { target: 'rouge', count: 2 }),
    os('o3', 'Transmettre un bilan juste aux secours', 'personnalise', { target: 'bilan_radio' }),
    os('o4', 'Ne pas s\'exposer plus de vingt secondes d\'affilée aux gaz', 'survivre', { seconds: 20 }),
  ],
  failures: [fail('victime_non_secourue', 'Un cas rouge est traité en dernier.'), fail('joueur_hors_combat', 'Malaise du médecin sous les gaz.')],
  randomEvents: ['Retour de gaz par vent tournant', 'Un asthmatique demande son inhalateur', 'Un manifestant vous demande de le soigner le premier', 'Un projectile tombe près du sac'],
  unique: 'Le tri est la compétence : l\'ordre des soins décide de la survie.',
  tags: ['tri', 'gaz', 'miroir'],
});

export const MED_03 = mission({
  ...MED, type: 'protection_secours', difficulty: 3, chapter: 13,
  id: 'medecin-03-trois-metres-cinquante',
  title: 'Trois mètres cinquante',
  pitch: 'Obtenir un couloir de trois mètres cinquante auprès des forces de l\'ordre pour extraire une urgence absolue.',
  briefing: [
    `Rue Saint-Honoré, l'affrontement bat son plein entre un groupe de manifestants et la ligne de CRS. Un manifestant gît inconscient, entre les deux camps, la tête en sang. Les forces de l'ordre ne vous connaissent pas. Vous êtes médecin bénévole avec un sac rouge.`,
    `Votre mission est d'obtenir un couloir de trois mètres cinquante de large, de joindre l'officier qui commande, de faire cesser momentanément l'affrontement sur ce secteur et d'extraire la victime en moins de quatre minutes.`,
    `Approchez la ligne, mains levées, brassard visible. Identifiez-vous : « Médecin, urgence vitale. » Demandez au commandant le couloir. Pendant le couloir, deux manifestants vous aident à porter. Faites évacuer la victime vers le SAMU.`,
    `Ne traversez jamais la ligne sans autorisation. Ne vous placez pas entre les deux camps pendant un jet. Une communication claire avec l'officier vaut plus que la vitesse.`,
  ],
  place: 'Rue Saint-Honoré', timeOfDay: 17, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.55, 0.65, 0.15, { gilets_jaunes: 0.3, black_bloc: 0.15, militants: 0.2, curieux: 0.35 },
    ['Rue Saint-Honoré', 'Rue Royale'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; un blessé inconscient entre les lignes.',
    'Une soixantaine d\'individus déterminés.', ['Rue Saint-Honoré', 'Rue Royale'],
    ['S\'identifier à voix haute', 'Joindre l\'officier', 'Prévoir deux porteurs']),
  phases: [
    ph('mains-levees', `Mains levées vers la ligne`,
      `Rue Saint-Honoré, entre les manifestants et la ligne de CRS, un homme gît inconscient, la tête en sang. Personne ne lance plus, personne n'avance : chacun attend que l'autre cesse. Vous marchez vers les boucliers, mains levées, brassard visible, le sac rouge sur le dos.`,
      T(50), [
        voix('CRS', `Halte ! On ne passe pas ! Reculez !`),
        voix('COÉQUIPIÈRE', `Dis-leur qui tu es, fort, avant d'avancer d'un pas de plus !`),
      ], [`Un projectile tombe à dix mètres`]),
    ph('couloir', `Un couloir, demandé poliment`,
      `Le chef de section s'est approché, visière levée. Il ne vous connaît pas, il attend un ordre, et dans son dos l'ambulance du SAMU est arrêtée à l'angle de la rue Royale. Ce que vous lui demandez tient en une phrase : un couloir de trois mètres cinquante dans sa ligne, deux minutes, pour une urgence vitale.`,
      T(70), [
        voix('CHEF DE SECTION', `Vous êtes qui ? Médecin de quoi ? Je ne peux pas ouvrir ma ligne comme ça, j'attends la réponse de mon commandant.`),
        voix('MANIFESTANT', `Ils vont le laisser crever par terre ! Dites-leur d'ouvrir !`),
      ], [`Le chef de section attend un ordre`, `Un blessé léger réclame vos soins au passage`]),
    ph('brancardage', `Le portage entre deux rangées de boucliers`,
      `La ligne s'entrouvre. Il faut deux porteurs : deux manifestants que vous désignez du doigt, qui hésitent, puis viennent. Tête maintenue, un de chaque côté, au pas, entre deux rangées de boucliers jusqu'à l'ambulance de la rue Royale ; derrière vous, la rue Saint-Honoré retient son souffle.`,
      OBJ('o2'), [
        voix('CHEF DE SECTION', `Couloir ! Laissez passer le médecin et ses porteurs ! Les autres restent où ils sont !`),
        voix('PORTEUR', `Je le prends par où ? Je n'ai jamais fait ça, moi. Il respire, au moins ?`),
      ], [`Un manifestant refuse de porter`, `Un projectile tombe près du couloir`, `La victime reprend conscience pendant le portage`]),
    ph('ambulance', `Les portes de l'ambulance`,
      `L'homme est sur le brancard du SAMU, à l'angle de la rue Royale, et les portes se referment. La ligne s'est ressoudée derrière vous ; vous êtes du mauvais côté pour repartir, avec deux manifestants qui regardent les boucliers de près pour la première fois.`,
      FIN, [
        voix('MÉDECIN DU SAMU', `Traumatisme crânien, c'est noté. Inconscient depuis quand ? Vous avez vu la chute ?`),
        voix('CHEF DE SECTION', `Je vous refais passer, vous et vos deux porteurs. Par la droite, sans courir.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Obtenir un couloir de trois mètres cinquante', 'proteger_site', { target: 'couloir_secours' }),
    ob('o2', 'Extraire la victime en moins de quatre minutes', 'secourir', { target: 'urgence_absolue', count: 1, seconds: 240 }),
    os('o3', 'Ne jamais traverser la ligne sans autorisation', 'personnalise', { target: 'traversee_sans_accord', max: 0 }),
    os('o4', 'Recruter deux porteurs', 'personnalise', { target: 'porteurs', count: 2 }),
  ],
  failures: [fail('victime_non_secourue', 'La victime n\'est pas extraite en quatre minutes.', 240), fail('joueur_hors_combat', 'Médecin blessé.')],
  randomEvents: ['Un projectile tombe près du couloir', 'La victime reprend conscience', 'Un manifestant refuse de porter', 'L\'officier s\'absente'],
  unique: 'La négociation d\'un couloir : le médecin dépend de l\'autre camp pour travailler.',
  tags: ['couloir', 'urgence'],
});

export const MED_04 = mission({
  ...MED, ...scene(CDT_06), difficulty: 4, chapter: 13, mirrorOf: CDT_06.id, altRoles: ['commandant'],
  id: 'medecin-04-le-hall',
  title: 'Le hall',
  pitch: 'Ouvrir un poste de soins improvisé dans un hall, y amener quatre blessés et guider les pompiers, pendant que l\'îlot est bouclé.',
  briefing: [
    `Rue de Turbigo, une nasse se referme sur l'îlot. Cent quatre-vingts personnes sont retenues, dont des soignants et des familles. Un hall d'immeuble, mis à disposition par un habitant, peut faire office de poste de soins improvisé. Vous êtes médecin bénévole.`,
    `Votre mission est d'ouvrir le poste dans le hall, d'y amener quatre blessés, de guider les pompiers et d'éviter que le poste soit gazé avec les blessés dedans. Le drone des forces de l'ordre vous voit : votre poste doit être identifiable.`,
    `Entrez, balisez : croix rouge, lumière. Allongez les blessés, prenez les constantes, rassurez. Demandez à un habitant de tenir la porte. Appelez le SAMU par téléphone. Faites sortir les non-blessés. Fermez la porte lors de tirs de gaz.`,
    `Un hall n'est pas un hôpital : ne gardez que ce que vous pouvez soigner. Les forces de l'ordre doivent savoir où est le poste, pour ne pas le gazer. Prévenez la liaison.`,
  ],
  intel: intel(
    'Cent quatre-vingts personnes retenues dans l\'îlot ; un hall disponible.',
    'Soixante individus déterminés dans l\'îlot.', ['Rue de Turbigo', 'Rue Saint-Denis', 'Rue Rambuteau'],
    ['Baliser le poste', 'Prévenir la liaison', 'Fermer la porte lors des tirs de gaz']),
  phases: [
    ph('hall', `Un hall, des cartons, une lampe`,
      `Rue de Turbigo, la nasse s'est refermée sur l'îlot. Un habitant a ouvert le hall de son immeuble, côté rue Saint-Denis : dix mètres carrés de carrelage, une minuterie, des boîtes aux lettres. Il faut en faire un poste de soins : une croix rouge sur la porte, une zone pour ceux qui marchent, une pour ceux qui attendent, et un seul couchage pour le cas grave.`,
      OBJ('o1'), [
        voix('HABITANT', `Entrez, entrez. Mais le syndic va me tuer. Vous en avez pour longtemps ?`),
        voix('COÉQUIPIÈRE', `Je scotche la croix sur la porte. Toi, tu fais les zones : assis à gauche, couchés au fond.`),
      ], [`Le gardien de l'immeuble veut fermer la porte`]),
    ph('flux', `Brûlure, cuir chevelu, panique, entorse`,
      `Le poste est ouvert, et ils arrivent : une main brûlée par une grenade ramassée, une plaie du cuir chevelu qui saigne beaucoup pour peu de chose, une jeune femme en crise d'angoisse, une cheville tordue dans la bousculade. Dehors, dans la rue de Turbigo, le mégaphone répète que la sortie est rue Rambuteau.`,
      OBJ('o2'), [
        voix('BLESSÉE', `J'étouffe… on est enfermés, ils ne nous laisseront pas sortir, j'étouffe…`),
        voix('MÉGAPHONE', `Vous pouvez quitter les lieux par la rue Rambuteau. Présentez-vous un par un.`),
      ], [`Une manifestante fait une crise d'angoisse`, `Un journaliste demande à entrer dans le hall`, `La minuterie du hall s'éteint`]),
    ph('porte', `Le gaz entre à chaque ouverture`,
      `Quatre blessés sont installés. Des grenades tombent à vingt mètres, côté rue Saint-Denis, et le gaz entre dans le hall chaque fois que la porte s'ouvre pour laisser passer quelqu'un. Les forces de l'ordre ne savent peut-être pas qu'il y a un poste de soins derrière cette porte : il faut que quelqu'un aille le leur dire.`,
      T(180), [
        voix('COÉQUIPIÈRE', `Chaque fois qu'on ouvre, ça rentre. On calfeutre le bas avec des vestes mouillées. Et il faut prévenir les CRS qu'on est là !`),
        voix('CRS', `Ouvrez ! On a un collègue blessé, il saigne de la jambe. Vous êtes médecin ?`),
      ], [`Une grenade lacrymogène tombe près de la porte du hall`, `Des policiers amènent un collègue blessé`]),
    ph('tenir-ou-demenager', `Tenir, ou déménager de quatre-vingts mètres`,
      `Une femme allongée au fond du hall ne répond plus très bien. Tenir ici, dans le gaz qui s'accumule, ou déménager tout le monde de quatre-vingts mètres, vers la sortie de la rue Rambuteau, où une ambulance pourrait approcher ? Il n'y a pas de bonne réponse, seulement une décision à prendre avant la prochaine grenade.`,
      T(200), [
        voix('RÉGULATION DU SAMU', `Une ambulance est à l'entrée de la rue de Turbigo. Elle n'entrera pas sans couloir ni escorte. Pouvez-vous amener la patiente jusqu'à la sortie ?`),
        voix('HABITANT', `Le gardien veut fermer à clé. Il dit que si ça dégénère, c'est lui qui paiera.`),
      ], [`Une blessée ne répond plus très bien`, `Le gardien menace de fermer à clé`]),
    ph('porte-rouverte', `La porte rouverte`,
      `Dehors, le bouclage se lève et la rue de Turbigo se vide par la rue Rambuteau. Le hall sent le gaz et le désinfectant ; sur le carrelage, des compresses, des cartons, une croix de ruban adhésif. Les pompiers entrent enfin avec un brancard, et l'habitant cherche un balai.`,
      FIN, [
        voix('SAPEUR-POMPIER', `C'est vous, le poste de soins ? On prend qui en premier ? Dites-moi ce que vous avez fait à chacun.`),
        voix('HABITANT', `Vous reviendrez me dire comment va la dame ? Je ne sais même pas son nom.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Ouvrir un poste de soins dans le hall', 'soigner', { place: 'Rue de Turbigo', target: 'poste_soins', count: 1 }),
    ob('o2', 'Accueillir quatre blessés', 'secourir', { count: 4 }),
    os('o3', 'Éviter que le poste soit gazé avec des blessés dedans', 'proteger_site', { target: 'poste_soins', place: 'Rue de Turbigo' }),
    os('o4', 'Guider les pompiers jusqu\'au hall', 'guider_unite', { target: 'pompiers' }),
  ],
  failures: [fail('victime_non_secourue', 'Le poste est gazé avec des blessés dedans.'), fail('joueur_hors_combat', 'Médecin blessé.')],
  randomEvents: ['Un habitant refuse de laisser la porte ouverte', 'Une grenade tombe près du hall', 'Un manifestant en crise d\'angoisse', 'Un journaliste réclame d\'entrer'],
  unique: 'Un hall devient un hôpital : l\'improvisation du soin sous la nasse.',
  tags: ['poste-de-soins', 'nasse', 'miroir'],
});

export const MED_05 = mission({
  ...MED, type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'medecin-05-neutre',
  title: 'Neutre',
  pitch: 'Un policier brûlé et un manifestant blessé à la tête sont à cinquante mètres l\'un de l\'autre : soigner les deux sans être pris pour l\'un ni l\'autre.',
  briefing: [
    `Place de la Concorde, une manifestation dégénère. Un policier brûlé par un cocktail incendiaire est à terre d'un côté ; un manifestant blessé à la tête par un projectile est à terre de l'autre. Vous êtes médecin bénévole, et vous êtes le seul à pouvoir intervenir rapidement.`,
    `Votre mission est de soigner les deux sans parti pris, de vous faire reconnaître des deux camps, de gagner la confiance des forces de l'ordre et des manifestants et d'obtenir l'évacuation par les secours.`,
    `Commencez par le plus grave. Annoncez à voix haute : « Médecin, neutre, je soigne les deux. » Parlez aux forces de l'ordre. Parlez aux manifestants. Demandez de l'aide à chaque camp pour porter. Prévenez les secours.`,
    `Chaque camp peut vous soupçonner de partialité : soyez transparent. Ne refusez jamais un soin à quelqu'un. Ne vous éloignez pas de votre sac. La neutralité est un principe, pas une faiblesse.`,
  ],
  place: 'Place de la Concorde', timeOfDay: 17.5, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(600, 'libertes', 0.6, 0.7, 0.2, { gilets_jaunes: 0.3, black_bloc: 0.15, syndical: 0.2, curieux: 0.35 },
    ['Place de la Concorde', 'Rue Royale', 'Avenue des Champs-Élysées'], 0.4),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Six cents personnes ; deux blessés à cinquante mètres l\'un de l\'autre.',
    'Une centaine d\'individus déterminés.', ['Place de la Concorde', 'Rue Royale'],
    ['Annoncer la neutralité', 'Soigner le plus grave en premier', 'Demander de l\'aide à chaque camp']),
  phases: [
    ph('deux-blesses', `Deux blessés, deux camps`,
      `Place de la Concorde, à vingt mètres l'un de l'autre : un policier à terre, la manche et le cou brûlés par un engin incendiaire, entouré de collègues qui ne savent pas quoi faire ; un manifestant assis contre une borne, la tête ouverte par un projectile, entouré d'amis qui hurlent. Vous êtes seul avec un sac.`,
      T(40), [
        voix('MANIFESTANT', `Par ici, docteur ! Il pisse le sang ! Laissez tomber le flic !`),
        voix('CRS', `Un médecin ! Il y a un médecin ? Il est brûlé, il faut quelqu'un, vite !`),
      ], [`Un journaliste cadre la scène`]),
    ph('le-plus-grave', `Le plus grave d'abord`,
      `Le plus grave d'abord, quel que soit son camp : c'est la brûlure du cou, qui gonfle, et qui peut fermer une gorge. Refroidir à l'eau, sans rien décoller, parler au blessé ; puis traverser les vingt mètres de la place de la Concorde, sous les huées des uns et le regard des autres, pour comprimer la plaie du second.`,
      OBJ('o1'), [
        voix('MANIFESTANT', `Il soigne un flic ! Regardez-le, il soigne un flic ! Tu es de quel côté, toi ?`),
        voix('CRS', `Hé ! Vous allez où ? Restez avec lui ! Vous n'allez pas le laisser pour ce type ?`),
      ], [`Un manifestant veut vous empêcher de soigner le policier`, `Un agent tente de vous retenir`, `Un projectile tombe près des blessés`]),
    ph('porteurs', `Des bras dans chaque camp`,
      `Les deux sont soignés ; aucun ne peut rester là. Les secours attendent à l'entrée de la rue Royale et ne s'avanceront pas sur la place. Il faut des bras : ceux des policiers pour l'un, ceux des manifestants pour l'autre, ou, si vous savez le demander, les uns pour porter l'autre.`,
      OBJ('o2'), [
        voix('CHEF DE SECTION', `Je vous ouvre un passage jusqu'à la rue Royale, pour les deux. Mais c'est vous qui dites à ceux d'en face de ne rien lancer pendant ce temps.`),
        voix('AMIE DU BLESSÉ', `On ne le confie pas aux flics. Vous venez avec nous, vous ne le lâchez pas ?`),
      ], [`Un policier refuse l'aide d'un civil`, `Des manifestants refusent de confier leur blessé aux secours officiels`]),
    ph('remise', `Deux brancards derrière le même fourgon`,
      `Rue Royale, deux brancards côte à côte derrière le même fourgon rouge : le policier brûlé et le manifestant blessé à la tête. Les pompiers ne demandent pas qui est qui. Sur la place de la Concorde, les deux camps se sont remis à se regarder ; vous, vous avez du sang sur un gant et de l'eau sur l'autre.`,
      FIN, [
        voix('SAPEUR-POMPIER', `Deux victimes, donc. Brûlure au cou et plaie de la tête. Lequel a perdu connaissance ?`),
        voix('JOURNALISTE', `Vous avez soigné les deux. On vous l'a reproché, des deux côtés. Vous diriez quoi, là, tout de suite ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Soigner les deux blessés avant l\'arrivée des secours', 'soigner', { target: 'blesse_grave', count: 2 }),
    ob('o2', 'Obtenir l\'évacuation des deux victimes en moins de quatre minutes', 'secourir', { count: 2, seconds: 240 }),
    os('o3', 'Se faire reconnaître par les deux camps', 'personnalise', { target: 'neutralite' }),
    os('o4', 'Ne refuser aucun soin', 'personnalise', { target: 'soin_refuse', max: 0 }),
  ],
  failures: [fail('victime_non_secourue', 'Une des deux victimes n\'est pas prise en quatre minutes.', 240), fail('joueur_hors_combat', 'Médecin blessé.')],
  randomEvents: ['Un manifestant hurle sur le médecin', 'Un policier refuse l\'aide d\'un civil', 'Un journaliste filme de près', 'Un projectile tombe près des blessés'],
  unique: 'La neutralité du soignant : le seul rôle où l\'on est du côté de tous.',
  tags: ['neutralite', 'deux-camps'],
});

export const MED_06 = mission({
  ...MED, type: 'manifestation_declaree', difficulty: 2, chapter: 13,
  id: 'medecin-06-fouille',
  title: 'Fouille',
  pitch: 'Passer un contrôle à l\'entrée du cortège : choisir ce qu\'on garde, expliquer son matériel sans perdre le sac.',
  briefing: [
    `Boulevard Voltaire, à l'entrée d'un cortège déclaré. Les forces de l'ordre procèdent à des fouilles par sondage. Vous portez dans votre sac du sérum physiologique, des compresses, un masque et des lunettes de protection. Un agent vous arrête.`,
    `Votre mission est de passer le contrôle sans perdre votre matériel, d'expliquer à l'agent à quoi il sert et de garder tout ce qui vous permettra de soigner. Le matériel de soin est licite, mais un masque et des lunettes peuvent être pris pour un équipement d'émeutier.`,
    `Montrez votre brassard. Expliquez : « Médecin bénévole, voici le sérum, les compresses, les gants. » Ne vous énervez pas. Demandez l'officier si l'agent hésite. Si l'on vous retire un objet, demandez un reçu.`,
    `Le masque et les lunettes sont ambigus : un agent peut les confisquer. Défendez-les avec calme. Vous ne devez jamais vous opposer physiquement. Un reçu vaut plus qu'une dispute.`,
  ],
  place: 'Boulevard Voltaire', timeOfDay: 14, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(800, 'pouvoir_achat', 0.25, 0.35, 0.03, { syndical: 0.4, familles: 0.2, etudiants: 0.2, curieux: 0.2 },
    ['Boulevard Voltaire', 'Place de la République'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 0, samu: 0 }),
  intel: intel(
    'Huit cents personnes ; fouilles par sondage à l\'entrée.',
    'Aucun signalement.', ['Boulevard Voltaire'],
    ['Montrer le brassard', 'Expliquer le matériel', 'Demander un reçu']),
  phases: [
    ph('file', `La file devant les barrières`,
      `Quatorze heures, boulevard Voltaire, à l'entrée du cortège déclaré. Les forces de l'ordre fouillent les sacs par sondage derrière un rang de barrières. Dans le vôtre : sérum physiologique, compresses, gants, et ce qui fera hésiter n'importe quel agent, un masque et des lunettes de protection.`,
      T(80), [
        voix('COÉQUIPIÈRE', `Brassard visible, sac ouvert avant qu'on te le demande. Et tu souris.`),
        voix('MANIFESTANT', `Ils ont refoulé une soignante tout à l'heure, à cause de son masque. Bon courage.`),
      ], [`Une autre soignante bénévole est refoulée au contrôle`]),
    ph('controle', `Le sac ouvert sur la barrière`,
      `Un gardien de la paix pose votre sac sur la barrière, boulevard Voltaire, et en sort le contenu, pièce par pièce. Le sérum, les compresses, les ciseaux à bouts ronds ; puis le masque, qu'il retourne entre ses doigts, et les lunettes. Tout tient à ce que vous direz dans les trente secondes, et au ton sur lequel vous le direz.`,
      OBJ('o1'), [
        voix('CRS', `Et ça, c'est pour quoi faire ? Un masque à gaz, des lunettes… Vous comptez aller où, avec ça ?`),
        voix('CRS', `Je vais devoir vous le retirer. C'est du matériel de protection, c'est interdit dans le périmètre.`),
      ], [`L'agent veut confisquer les lunettes et le masque`, `La file s'impatiente derrière vous`]),
    ph('officier', `L'officier, et le reçu`,
      `Le matériel de soin est passé. Pour le masque et les lunettes, l'agent a appelé son officier, qui arrive le long des barrières du boulevard Voltaire en regardant sa montre. Vous pouvez demander qu'on vous les laisse, ou demander un reçu si on vous les prend ; vous ne pouvez ni hausser le ton ni reprendre quoi que ce soit des mains d'un policier.`,
      FOULE('depart'), [
        voix('OFFICIER', `Médecin bénévole, d'accord. Le sérum, je comprends. Le masque, expliquez-moi pourquoi vous en auriez besoin dans un cortège déclaré.`),
        voix('COÉQUIPIÈRE', `S'ils le gardent, demande un reçu. Un papier, avec l'heure. Ne discute pas plus.`),
      ], [`Un officier vient trancher`]),
    ph('cortege', `Dans le cortège, avec ce qu'il vous reste`,
      `Le cortège s'ébranle sur le boulevard Voltaire vers la place de la République, sono en tête, sous un ciel clair. Vous marchez sur le trottoir, à hauteur du milieu, là où l'on vous trouvera si quelqu'un tombe ; ce que contient encore votre sac décidera de ce que vous pourrez faire.`,
      FIN, [
        voix('COÉQUIPIÈRE', `On se met au milieu du cortège, côté trottoir. Fais l'inventaire en marchant : qu'est-ce qu'il te reste ?`),
        voix('MANIFESTANTE', `Vous êtes soignants ? C'est bien que vous soyez là. J'espère qu'on n'aura pas besoin de vous.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Passer le contrôle en conservant le matériel de soin', 'personnalise', { target: 'sac_de_soins_conserve' }),
    ob('o2', 'Expliquer le matériel de façon claire', 'personnalise', { target: 'explication' }),
    os('o3', 'Garder les lunettes et le masque', 'personnalise', { target: 'protections_conservees' }),
    os('o4', 'Demander un reçu pour toute confiscation', 'personnalise', { target: 'recu' }),
  ],
  failures: [fail('interpelle', 'Vous êtes interpellé pour avoir résisté.'), fail('personnalise', 'Sac confisqué en entier.')],
  randomEvents: ['L\'agent veut confisquer les lunettes', 'Un autre médecin est refoulé', 'Un officier survient', 'La file avance lentement'],
  unique: 'Une scène de calme : la difficulté est d\'expliquer son rôle à un agent sceptique.',
  tags: ['controle', 'dialogue'],
});

export const MED_07 = mission({
  ...MED, type: 'manifestation_interdite', difficulty: 4, chapter: 13,
  id: 'medecin-07-entre-deux-lignes',
  title: 'Entre deux lignes',
  pitch: 'Un blessé est tombé entre la ligne de CRS et le bloc : aller le chercher en se faisant reconnaître des deux côtés.',
  briefing: [
    `Boulevard Henri IV, près de la place de la Bastille. Un manifestant, atteint par un éclat, est tombé entre la ligne de CRS et le bloc noir qui l'affronte. Chacun attend que l'autre cesse. Vous êtes médecin bénévole et le seul à pouvoir y aller.`,
    `Votre mission est d'aller chercher le blessé entre les lignes, de vous faire reconnaître des deux côtés, de le soigner sur place puis de l'évacuer. Vous ne devez pas laisser le blessé plus de quatre-vingt-dix secondes.`,
    `Mains levées, brassard visible. Annoncez-vous aux deux camps : « Médecin, j'avance ! » Avancez au pas. Soignez sur place : hémorragie d'abord. Portez avec l'aide de deux manifestants. Revenez par le même chemin.`,
    `Une erreur de timing peut vous mettre dans la ligne de tir. Ne traversez pas pendant un jet. Si un camp ne vous reconnaît pas, reculez.`,
  ],
  place: 'Boulevard Henri IV', timeOfDay: 19, weather: 'clair', windFrom: 260, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.65, 0.75, 0.25, { black_bloc: 0.3, gilets_jaunes: 0.25, curieux: 0.45 },
    ['Place de la Bastille', 'Boulevard Henri IV'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un blessé entre les lignes.',
    'Une centaine d\'individus déterminés.', ['Boulevard Henri IV', 'Place de la Bastille'],
    ['S\'identifier aux deux camps', 'Avancer au pas', 'Soigner l\'hémorragie d\'abord']),
  phases: [
    ph('no-mans-land', `Trente mètres de chaussée vide`,
      `Boulevard Henri IV, à cent mètres de la place de la Bastille. Entre la ligne de CRS et le bloc en noir, trente mètres de chaussée vide jonchée de débris, et au milieu un homme couché sur le flanc, qui se tient la cuisse. Mains levées, brassard en évidence, vous vous annoncez aux deux camps, puis vous avancez au pas : celui qui court se fait prendre pour autre chose.`,
      OBJ('o1'), [
        voix('COÉQUIPIÈRE', `Crie-le aux deux : médecin, j'avance ! Et attends qu'ils t'aient vu avant de bouger !`),
        voix('CRS', `Médecin ! On vous a vu ! Vous avez une minute, après on ne répond plus de rien !`),
        voix('BLESSÉ', `Ma jambe… je ne sens plus ma jambe… ne me laissez pas là…`),
      ], [`Un jet isolé tombe près de vous`, `Un des deux camps ne reconnaît pas le brassard`, `Retour de gaz sur la chaussée`]),
    ph('porche', `Sous un porche, la main sur la plaie`,
      `Le blessé est sorti de l'entre-deux et allongé sous un porche du boulevard Henri IV, la plaie comprimée. Derrière vous, l'affrontement reprend comme s'il n'avait attendu que cela. Il faut maintenant tenir la compression sans relâcher, joindre les secours, et trouver par où faire venir un brancard.`,
      T(180), [
        voix('RÉGULATION DU SAMU', `Hémorragie de la cuisse, compression en place, c'est noté. Une équipe part de la Bastille à pied. Ne relâchez pas.`),
        voix('PORTEUR', `Je fais quoi, moi ? J'appuie avec vous ? J'ai les mains qui tremblent.`),
      ], [`Les affrontements reprennent derrière vous`, `Un second blessé vous est amené`]),
    ph('brancard', `Le brancard venu de la Bastille`,
      `L'équipe du SAMU arrive par le trottoir depuis la place de la Bastille, brancard plié sous le bras. Vous passez la compression à l'infirmier main dans la main, sans qu'une seconde s'écoule entre vos doigts et les siens. Sur le boulevard Henri IV, personne n'a remarqué que vous étiez revenu.`,
      FIN, [
        voix('INFIRMIER DU SAMU', `Je prends la compression. À trois : un, deux, trois. C'est bon, je l'ai. Depuis quand il saigne ?`),
        voix('COÉQUIPIÈRE', `Tes gants. Change-les. Et bois quelque chose avant d'y retourner.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Récupérer le blessé entre les lignes en moins de quatre-vingt-dix secondes', 'secourir', { target: 'blesse', count: 1, seconds: 90 }),
    ob('o2', 'Se faire reconnaître des deux camps', 'personnalise', { target: 'neutralite' }),
    os('o3', 'Contrôler l\'hémorragie sur place', 'soigner', { target: 'hemorragie', count: 1 }),
    os('o4', 'Ne pas être blessé', 'survivre'),
  ],
  failures: [fail('victime_non_secourue', 'Blessé laissé plus de quatre-vingt-dix secondes.', 90), fail('joueur_hors_combat', 'Médecin blessé.')],
  randomEvents: ['Un jet isolé tombe près de vous', 'Un camp ne reconnaît pas le brassard', 'Un manifestant aide à porter', 'Retour de gaz'],
  unique: 'Le no man\'s land : on traverse la ligne de feu avec un sac et des mains levées.',
  tags: ['no-mans-land', 'urgence'],
});

export const MED_08 = mission({
  ...MED, type: 'protection_secours', difficulty: 4, chapter: 13,
  id: 'medecin-08-trier-seul',
  title: 'Trier seul',
  pitch: 'Six blessés, un seul binôme : choisir l\'ordre, transmettre six bilans justes.',
  briefing: [
    `Rue de Rivoli, la manifestation a tourné à l'affrontement. Six blessés sont à terre : un traumatisme crânien, une hémorragie de la cuisse, une brûlure, trois intoxiqués. Les secours sont à sept minutes. Vous êtes en binôme avec une infirmière.`,
    `Votre mission est de choisir l'ordre des soins, de traiter les rouges d'abord et de transmettre aux secours six bilans justes. Le tri est votre seule arme : il détermine qui vit.`,
    `Évaluez rapidement : respiration, hémorragie, conscience. Rouge : hémorragie et traumatisme crânien. Jaune : brûlure. Vert : intoxiqués. Traitez, transmettez. Votre binôme prend la brûlure. Demandez des renforts.`,
    `Un rouge traité en dernier est une faute lourde. Ne passez pas trop de temps sur un cas désespéré. Gardez un œil sur les verts.`,
  ],
  place: 'Rue de Rivoli', timeOfDay: 18, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, 'libertes', 0.55, 0.65, 0.2, { black_bloc: 0.25, gilets_jaunes: 0.25, curieux: 0.5 },
    ['Rue de Rivoli', 'Rue de Castiglione'], 0.2),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents personnes ; six blessés à terre.',
    'Une soixantaine d\'individus déterminés.', ['Rue de Rivoli'],
    ['Évaluer avant de soigner', 'Traiter les rouges d\'abord', 'Transmettre un bilan par blessé']),
  phases: [
    ph('six-a-terre', `Six à terre, sept minutes`,
      `Rue de Rivoli, sous les arcades, à l'abri des projectiles. Six blessés alignés par ceux qui les ont traînés là : un homme qui ne reconnaît plus personne, une cuisse qui saigne à travers un jean, une main et un avant-bras brûlés, trois personnes qui toussent à s'en déchirer la gorge. Les secours sont à sept minutes, et vous êtes deux.`,
      T(60), [
        voix('INFIRMIÈRE', `Sept minutes avant les pompiers. Je prends la brûlure et les trois qui toussent. Toi, tu choisis entre les deux autres.`),
        voix('BLESSÉ', `Où je suis ? C'est quel jour ? Pourquoi j'ai du sang…`),
      ], [`Un projectile tombe à l'entrée de l'arcade`]),
    ph('deux-rouges', `Deux rouges pour deux mains`,
      `L'homme désorienté a pris un coup sur le crâne : il parle, mais de moins en moins juste. La cuisse, elle, saigne rouge vif et ne s'arrêtera pas seule. Deux urgences, une seule paire de mains : comprimer d'abord ce qui tue en trois minutes, surveiller à la voix ce qui tue en trente, sous les arcades de la rue de Rivoli.`,
      OBJ('o1'), [
        voix('INFIRMIÈRE', `La cuisse d'abord, elle se vide ! Parle à l'autre pendant que tu appuies, fais-le compter !`),
        voix('MANIFESTANT', `Et mon pote ? Il tousse depuis dix minutes, vous ne faites rien pour lui !`),
      ], [`Un manifestant réclame la priorité pour un intoxiqué`, `Le blessé à la tête cesse de répondre`]),
    ph('vert-qui-vire', `Le vert qui vire au jaune`,
      `Les deux rouges sont pris en main. Parmi les trois intoxiqués assis contre le mur des arcades, une jeune femme a cessé de tousser : elle respire vite, à petits coups, les lèvres grises. Personne ne regarde ceux qu'on a classés verts ; c'est pour cela qu'il faut y retourner, sans lâcher la cuisse.`,
      T(150), [
        voix('INFIRMIÈRE', `La petite, à droite : elle ne tousse plus. Ce n'est pas bon signe. Je ne peux pas lâcher la brûlure, vas-y.`),
        voix('BLESSÉE', `Ça siffle… j'ai de l'asthme… mon sac est resté là-bas…`),
      ], [`Un cas classé vert s'aggrave`, `Le téléphone ne capte plus sous les arcades`]),
    ph('six-bilans', `Six bilans justes`,
      `Les sirènes approchent par la rue de Castiglione. Avant qu'elles soient là, six bilans à dicter au téléphone, un par personne : ce que vous avez vu, ce que vous avez fait, ce qui a changé depuis. Un bilan arrangé pour paraître meilleur est un bilan faux, et c'est sur lui que l'équipe suivante décidera.`,
      OBJ('o2'), [
        voix('RÉGULATION DU SAMU', `Je vous écoute. Victime par victime : âge apparent, état, gestes, évolution. Commencez par la plus grave.`),
        voix('INFIRMIÈRE', `Dis-leur que la jeune femme s'est aggravée. Ne dis pas qu'on l'avait vue : on ne l'avait pas vue.`),
      ], [`La communication coupe au milieu d'un bilan`]),
    ph('releve-des-secours', `Les sirènes de la rue de Castiglione`,
      `Deux ambulances et un fourgon rouge s'arrêtent à l'angle de la rue de Castiglione ; les arcades de la rue de Rivoli se remplissent de vestes fluorescentes. On vous prend la cuisse des mains, on vous pose trois questions, on ne vous dit pas merci tout de suite. Vous restez assis par terre une minute, le dos contre un pilier.`,
      FIN, [
        voix('MÉDECIN DU SAMU', `C'est vous qui avez trié ? D'accord. On reprend. Celui de la tête, il a perdu connaissance à quel moment ?`),
        voix('INFIRMIÈRE', `On a fait ce qu'on pouvait avec quatre mains. Viens, on va compter ce qu'il reste dans les sacs.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Traiter les deux cas rouges en premier', 'soigner', { target: 'rouge', count: 2 }),
    ob('o2', 'Transmettre six bilans justes', 'personnalise', { target: 'bilan_radio', count: 6 }),
    os('o3', 'Surveiller l\'évolution des cas verts', 'secourir', { target: 'vert', count: 3 }),
    os('o4', 'Garder son binôme actif sur la brûlure', 'personnalise', { target: 'binome_actif' }),
  ],
  failures: [fail('victime_non_secourue', 'Un cas rouge est traité en dernier.'), fail('personnalise', 'Un bilan est faux.')],
  randomEvents: ['Un vert s\'aggrave', 'Un manifestant demande de l\'aide en priorité', 'La radio tombe en panne', 'Un projectile tombe à proximité'],
  unique: 'Le tri sans ressources : l\'éthique du choix à l\'état brut.',
  tags: ['tri', 'binome'],
});

export const MEDECIN: MissionDef[] = [MED_01, MED_02, MED_03, MED_04, MED_05, MED_06, MED_07, MED_08];
