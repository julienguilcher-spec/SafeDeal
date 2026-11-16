/* =====================================================================================
 * Catalogue — l'école de formation (chapitre 0 de la carrière) : quatre ateliers de trois minutes.
 * Tenir la ligne, porter le bouclier, écouter et prononcer les sommations, premiers secours.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, intel, mission, OBJ, ob, os, ph, rad, SOMMATIONS, T, voix } from './dsl';
import type { MissionSpec } from './dsl';

const ELEVE: Pick<MissionSpec, 'role' | 'rank' | 'type' | 'duration' | 'chapter' | 'difficulty'> = {
  role: 'crs', rank: 'gardien_stagiaire', type: 'formation', duration: 'courte', chapter: 0, difficulty: 1,
};

export const ECOLE_01 = mission({
  ...ELEVE, poste: 'bouclier',
  id: 'ecole-01-tenir-la-ligne',
  title: 'École — Tenir la ligne',
  pitch: 'Premier atelier : se placer au coude à coude, tenir l\'alignement et suivre les commandements à la voix.',
  briefing: [
    `Terrain d'instruction installé sur la place de l'École Militaire, par un matin d'automne clair. Un moniteur commande une section de seize élèves. Il n'y a ni foule ni danger : il s'agit d'apprendre le geste de base du maintien de l'ordre, la ligne de barrage.`,
    `Votre mission est de vous placer dans la ligne à soixante-dix centimètres de vos voisins, de la tenir pendant trois minutes et d'exécuter sans délai les commandements « En ligne ! », « Halte ! », « En avant, marche ! » et « Reformez ! ».`,
    `Écoutez le moniteur. Au commandement « En ligne ! », vous vous alignez sur le voisin de droite. Au commandement « Halte ! », vous vous arrêtez net. Le bouclier reste vertical, collé à celui du voisin. Un écart de plus de trente centimètres est signalé par une marque rouge au sol.`,
    `Ne tournez pas la tête, ne parlez pas, regardez devant vous. Vous pouvez recommencer l'atelier autant de fois qu'il le faut : seule la réussite compte pour passer au suivant.`,
  ],
  place: 'Place de l\'École Militaire', timeOfDay: 9, weather: 'clair', windFrom: 270, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ sections: 1, fourgons: 3 }),
  intel: intel('Aucune foule : exercice à blanc.', 'Aucun signalement.', ['Place de l\'École Militaire'],
    ['Aligner son bouclier sur le voisin de droite', 'Tenir la ligne à soixante-dix centimètres', 'Obéir aux commandements à la voix']),
  phases: [
    ph('colonne', `De la colonne à la ligne`,
      `Place de l'École Militaire, les seize élèves attendent en colonne par deux devant les fourgons alignés. Au commandement, la colonne s'ouvre et se déploie face à l'avenue : vous prenez votre créneau, bouclier joint à celui du voisin de droite.`,
      T(30), [
        voix('MONITEUR', `Section, en ligne ! Boucliers !`),
        voix('MONITEUR', `Alignez-vous sur la droite. Soixante-dix centimètres entre deux épaules, pas un de plus.`),
      ]),
    ph('cordeau', `L'alignement au cordeau`,
      `Le moniteur passe derrière le rang, d'un bout à l'autre de la place, et corrige chaque écart du plat de la main. Une marque rouge apparaît au sol dès que vous sortez de l'alignement de plus de trente centimètres.`,
      T(40), [
        voix('MONITEUR', `Regardez devant vous, pas vos pieds. C'est le voisin de droite qui donne la ligne.`),
        voix('MONITEUR', `Tout le rang, un pas en arrière. Et on se réaligne sans se regarder.`),
      ], [`Le moniteur fait reculer tout le rang d'un pas`]),
    ph('evolutions', `En avant, halte, reformez`,
      `La ligne quitte son emplacement et traverse la place au pas, vers la grille de l'École militaire. Trois commandements tombent sans prévenir : la marche, l'arrêt net, puis la reformation après une rupture voulue par le moniteur.`,
      OBJ('o2'), [
        voix('MONITEUR', `En avant, marche !`),
        voix('MONITEUR', `Halte !`),
        voix('MONITEUR', `Rompez. Trois secondes de désordre… Reformez !`),
      ], [`Le voisin de gauche part avec un temps de retard`, `Le moniteur rompt la ligne sans prévenir`]),
    ph('immobile', `Jusqu'au coup de sifflet`,
      `Les trois commandements sont exécutés : la section revient face aux fourgons, au milieu de la place de l'École Militaire. Il reste à tenir l'alignement sans un mot, le regard droit devant, pendant que le moniteur compte les fautes de chacun.`,
      FIN, [
        voix('MONITEUR', `Les ordres, c'est acquis. Maintenant on ne bouge plus : bouclier vertical, jusqu'à mon coup de sifflet.`),
      ], [`Un élève voisin laisse glisser son bouclier`]),
  ],
  objectives: [
    ob('o1', 'Rester aligné pendant deux minutes au total, avec un écart inférieur à trente centimètres', 'tenir_position', { place: 'Place de l\'École Militaire', seconds: 120 }),
    ob('o2', 'Exécuter trois commandements à la voix en moins de deux secondes chacun', 'personnalise', { target: 'commandement', count: 3 }),
    os('o3', 'Réaliser les trois évolutions sans aucune faute d\'alignement', 'personnalise', { target: 'faute_alignement', max: 0 }),
  ],
  failures: [fail('personnalise', 'Ligne quittée pendant plus de dix secondes : atelier à refaire.', 10), fail('temps', 'Les trois minutes de l\'atelier sont écoulées sans que les commandements aient été exécutés.', 180)],
  randomEvents: ['Un moniteur reprend l\'alignement du rang', 'Un élève voisin perd son bouclier'],
  unique: 'Aucun adversaire : la discipline de la ligne est le premier apprentissage.',
  tags: ['ecole', 'atelier', 'ligne'],
});

export const ECOLE_02 = mission({
  ...ELEVE, poste: 'bouclier',
  id: 'ecole-02-porter-le-bouclier',
  title: 'École — Porter le bouclier',
  pitch: 'Deuxième atelier : tenir le bouclier face à des projectiles de mousse, abriter le collègue du second rang et avancer en tortue.',
  briefing: [
    `Sur la pelouse du Champ-de-Mars, un petit groupe d'élèves s'entraîne sous la direction d'un moniteur. Des figurants lancent des projectiles de mousse pour simuler des jets. Le bouclier pèse quatre kilos au bout du bras : il se porte près du corps, coude plié, et non à bout de bras.`,
    `Votre mission est de porter le bouclier en position haute, moyenne et basse, de couvrir un collègue du second rang et de progresser en tortue sur dix mètres. Vous ne ripostez jamais : vous parez.`,
    `Position haute pour les jets qui retombent, moyenne face à la foule, basse pour ce qui roule ou rebondit au sol. Dans la tortue, les deux rangs se serrent, les boucliers se touchent par-dessus les têtes. Avancez de dix mètres au pas, sans séparer vos boucliers.`,
    `Relevez le bouclier en pliant les jambes, pas le dos. Gardez le menton baissé derrière le bord supérieur. Chaque projectile qui passe est compté par le moniteur : au troisième, l'atelier est à refaire.`,
  ],
  place: 'Champ-de-Mars', timeOfDay: 10, weather: 'nuageux', windFrom: 260, windSpeed: 2,
  crowd: crowd(30, '', 0.1, 0.1, 0, { curieux: 1 }, [], 0),
  forces: forces({ sections: 1, fourgons: 3 }),
  intel: intel('Trente figurants lançant des projectiles de mousse.', 'Aucun signalement.', ['Champ-de-Mars'],
    ['Plier les jambes pour relever le bouclier', 'Baisser le menton', 'Parer sans riposter']),
  phases: [
    ph('prise-en-main', `Quatre kilos au bout du bras`,
      `Sur la pelouse du Champ-de-Mars, le moniteur fait prendre le bouclier près du corps, coude plié. Vous enchaînez à son commandement les trois positions : haute pour ce qui retombe, moyenne face à la foule, basse pour ce qui roule au sol.`,
      T(25), [
        voix('MONITEUR', `Bouclier haut ! Moyen ! Bas !`),
        voix('MONITEUR', `Près du corps, coude plié. À bout de bras, vous ne tiendrez pas trois minutes.`),
      ]),
    ph('mousse', `Quinze blocs de mousse`,
      `Trente figurants alignés à quinze mètres, dos à la tour Eiffel, lancent des blocs de mousse : d'abord en cloche, puis au ras de la pelouse. Vous parez pour vous et pour le collègue du second rang, qui ne voit pas partir les jets.`,
      OBJ('o1'), [
        voix('MONITEUR', `Couvrez le collègue derrière vous. Votre bouclier est aussi le sien.`),
        voix('MONITEUR', `Menton rentré derrière le bord. Pliez les jambes, pas le dos.`),
      ], [`Les figurants lancent en cloche, puis au ras du sol`, `Un figurant lance plus fort que les autres`]),
    ph('tortue', `La tortue sur dix mètres`,
      `Quinze projectiles sont parés : le moniteur fait serrer les deux rangs au milieu du Champ-de-Mars, et les boucliers du second rang passent au-dessus des têtes. La tortue doit avancer de dix mètres au pas, sans qu'un seul bouclier se sépare de son voisin.`,
      FIN, [
        voix('MONITEUR', `Tortue ! Serrez, serrez encore !`),
        voix('MONITEUR', `En avant, au pas. On avance ensemble ou on n'avance pas.`),
      ], [`Les jets de mousse reprennent pendant la progression`]),
  ],
  objectives: [
    ob('o1', 'Parer au moins quinze projectiles avec le bouclier', 'personnalise', { target: 'projectile_pare', count: 15 }),
    ob('o2', 'Avancer de dix mètres en tortue sans séparer les boucliers', 'personnalise', { target: 'metres_en_tortue', count: 10 }),
    os('o3', 'Ne pas laisser passer plus de deux projectiles', 'personnalise', { target: 'projectile_passe', max: 2 }),
  ],
  failures: [fail('personnalise', 'Bouclier lâché ou trois projectiles passés : atelier à refaire.', 3), fail('temps', 'Les trois minutes de l\'atelier sont écoulées avant la fin de la tortue.', 180)],
  randomEvents: ['Un figurant jette trop fort', 'Le moniteur fait rompre la tortue pour la corriger'],
  unique: 'Le bouclier est un outil : on y apprend à protéger le collègue avant soi-même.',
  tags: ['ecole', 'atelier', 'bouclier'],
});

export const ECOLE_03 = mission({
  ...ELEVE, poste: 'chef_groupe',
  id: 'ecole-03-ecouter-les-sommations',
  title: 'École — Écouter et prononcer les sommations',
  pitch: 'Troisième atelier : apprendre le texte exact des sommations, puis les prononcer au mégaphone devant des figurants.',
  briefing: [
    `Esplanade des Invalides, un matin de brume. Quarante figurants jouent un attroupement. Le moniteur vous fait entendre l'annonce et les sommations telles qu'elles figurent à l'article R. 211-11 du code de la sécurité intérieure, puis vous demande de les prononcer à votre tour. Sur le terrain, seul le commandant, ceint de son écharpe tricolore, les prononce : chaque agent doit pourtant les reconnaître à l'oreille, car elles disent ce que l'unité a le droit de faire.`,
    `Votre mission est d'écouter les trois formules réglementaires, de les répéter sans en changer un mot, puis de les prononcer dans l'ordre devant les figurants avec le mégaphone, en laissant une issue ouverte et un délai entre chaque annonce.`,
    `Première partie : écoutez l'annonce, la première sommation, la dernière sommation. Deuxième partie : prononcez-les. Le moniteur note chaque mot manquant ou ajouté. Laissez quinze secondes entre deux formules. Avant de commencer, montrez l'issue laissée ouverte à la foule.`,
    `Les formules antérieures à 2021 sont périmées : seule la version actuelle est valable. Une sommation prononcée sans l'écharpe ou sans haut-parleur ne vaut rien. Une formule oubliée, inversée ou abrégée annule l'atelier.`,
  ],
  place: 'Esplanade des Invalides', timeOfDay: 10, weather: 'brouillard', windFrom: 270, windSpeed: 1,
  crowd: crowd(40, '', 0.3, 0.2, 0, { curieux: 1 }, [], 0),
  forces: forces({ sections: 1, fourgons: 3 }),
  intel: intel('Quarante figurants qui jouent un attroupement.', 'Aucun signalement.', ['Esplanade des Invalides'],
    ['Apprendre le texte mot pour mot', 'Laisser quinze secondes entre deux formules', 'Montrer une issue ouverte avant de sommer']),
  phases: [
    ph('ecoute', `Les trois formules, à l'oreille`,
      `Esplanade des Invalides, dans la brume du matin. Le moniteur ceint l'écharpe tricolore, lève le mégaphone et dit les trois formules dans l'ordre devant les quarante figurants : vous écoutez sans prendre de notes.`,
      T(40), [
        voix('MONITEUR', SOMMATIONS.annonce),
        voix('MONITEUR', SOMMATIONS.premiere),
        voix('MONITEUR', SOMMATIONS.derniere),
      ]),
    ph('repetition', `Mot pour mot, sans mégaphone`,
      `À l'écart des figurants, près des fourgons garés le long de l'esplanade, vous répétez chaque formule après le moniteur. Il vous arrête au premier mot changé et vous fait reprendre la phrase entière.`,
      T(40), [
        voix('MONITEUR', `À vous. Mot pour mot : la loi ne se résume pas.`),
        voix('MONITEUR', `Celle-là, vous l'avez entendue où ? Elle est périmée depuis 2021. Reprenez.`),
      ], [`Le moniteur glisse une formule d'avant 2021 pour voir si vous la relevez`]),
    ph('devant-les-figurants', `L'issue d'abord, l'annonce ensuite`,
      `Écharpe en bandoulière et mégaphone en main, vous faites face aux quarante figurants massés au milieu de l'esplanade des Invalides. Vous leur montrez d'abord par où partir, puis vous prononcez l'annonce et les deux sommations en laissant quinze secondes entre chacune.`,
      OBJ('o1'), [
        voix('MONITEUR', `Montrez l'issue, puis l'annonce. Quinze secondes entre deux formules : comptez-les dans votre tête.`),
        voix('FIGURANT', `Et par où on sort, nous ? On n'entend rien dans ce brouillard !`),
      ], [`Un figurant réclame la parole au milieu d'une formule`, `Le mégaphone grésille : la phrase est à reprendre en entier`]),
    ph('fiche', `La fiche du moniteur`,
      `Les trois formules sont dites dans l'ordre. Pendant que les figurants quittent l'esplanade par l'issue restée ouverte, le moniteur relit sa fiche à voix haute : mots manquants ou ajoutés, délais tenus ou non, issue montrée ou oubliée.`,
      FIN, [
        voix('MONITEUR', `Sur le terrain, c'est le commandant qui les prononce. Vous, vous saurez à l'oreille ce que l'unité a le droit de faire après chacune.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Prononcer l\'annonce, la première puis la dernière sommation dans l\'ordre', 'sommations_regulieres', { count: 3 }),
    ob('o2', 'Prononcer chaque formule sans un mot manquant', 'personnalise', { target: 'texte_exact', count: 3 }),
    os('o3', 'Montrer l\'issue ouverte à la foule avant l\'annonce', 'prevention', { target: 'issue_annoncee', count: 1 }),
  ],
  failures: [fail('personnalise', 'Une formule est oubliée, inversée ou prononcée sans l\'écharpe : atelier à refaire.'), fail('temps', 'Les trois minutes de l\'atelier sont écoulées avant la dernière sommation.', 180)],
  randomEvents: ['Un figurant réclame la parole au milieu d\'une formule', 'Le mégaphone grésille : il faut répéter la phrase entière', 'Le brouillard étouffe la voix : le moniteur fait avancer de dix mètres'],
  unique: 'Les trois formules exactes de la loi : le moniteur corrige au mot près.',
  tags: ['ecole', 'atelier', 'sommations'],
});

export const ECOLE_04 = mission({
  ...ELEVE, poste: 'interpellation',
  id: 'ecole-04-premiers-secours',
  title: 'École — Premiers secours',
  pitch: 'Quatrième atelier : alerter, protéger, mettre en position latérale de sécurité, arrêter une hémorragie et transmettre un bilan.',
  briefing: [
    `Place de Fontenoy, sur l'aire d'exercice montée pour la formation aux premiers secours. Un moniteur a disposé trois mannequins : un manifestant inconscient qui respire, un passant qui saigne de l'avant-bras, un agent brûlé à la main. Vous êtes le gardien arrivé le premier, avant les secours.`,
    `Votre mission est d'alerter les secours, de protéger les blessés, de mettre le mannequin inconscient en position latérale de sécurité, d'arrêter l'hémorragie par compression directe et de refroidir la brûlure à l'eau.`,
    `Alertez d'abord, par la radio. Protégez la zone. Puis dans l'ordre : l'inconscient qui respire (position latérale de sécurité), l'hémorragie (compression directe, pansement), la brûlure (eau froide en continu, le temps que les secours arrivent). Parlez à chaque victime : dites qui vous êtes et ce que vous faites.`,
    `Ne déplacez pas sans nécessité un blessé qui a pu se faire mal au dos ou au cou. Ne décollez pas un vêtement d'une brûlure. Mettez vos gants avant de toucher une plaie. Le bilan transmis aux secours dit le nombre de victimes, l'état de chacune et les gestes déjà faits.`,
  ],
  place: 'Place de Fontenoy', timeOfDay: 11, weather: 'couvert', windFrom: 250, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ sections: 1, fourgons: 3, pompiers: 1, samu: 1 }),
  intel: intel('Trois mannequins de secours.', 'Aucun signalement.', ['Place de Fontenoy'],
    ['Alerter avant tout', 'Protéger avant de soigner', 'Parler au blessé']),
  phases: [
    ph('alerte', `Alerter avant de toucher`,
      `Place de Fontenoy, trois mannequins sont étendus sur l'aire d'exercice : un manifestant qui ne répond pas, un passant qui saigne de l'avant-bras, un agent brûlé à la main. Vous êtes le premier arrivé : la radio d'abord, puis les curieux à écarter.`,
      T(30), [
        voix('MONITEUR', `Trois victimes. Avant de toucher qui que ce soit : qui prévenez-vous, et que dites-vous ?`),
        rad('CENTRAL', 'MISTRAL 1 ALFA', `Je vous reçois mal. Répétez le lieu et le nombre de victimes.`),
      ], [`La radio grésille pendant l'alerte : le lieu est à répéter`]),
    ph('inconscient', `Celui qui ne répond pas`,
      `Le premier mannequin, couché sur le dos au pied d'un banc de la place, respire mais ne réagit ni à la voix ni au toucher. Vous devez le tourner sur le côté, tête basculée en arrière, avant de vous occuper des deux autres.`,
      OBJ('o2'), [
        voix('MONITEUR', `Dans l'ordre : celui qui ne répond pas, celui qui saigne, celui qui a mal.`),
        voix('CURIEUX', `Il faut le relever, non ? Je vous aide à l'asseoir contre le banc ?`),
      ], [`Un curieux veut relever le blessé inconscient`, `Le mannequin cesse de respirer s'il reste sur le dos`]),
    ph('plaie-et-brulure', `Celui qui saigne, celui qui a mal`,
      `L'inconscient est sur le côté et respire. À trois mètres, le passant se tient l'avant-bras : gants, compression directe, pansement. L'agent brûlé attend près du fourgon, la main à refroidir sous l'eau sans décoller le gant.`,
      OBJ('o3'), [
        voix('MONITEUR', `Parlez-leur. Dites qui vous êtes et ce que vous faites, même à un mannequin.`),
        voix('MONITEUR', `Une quatrième victime sort des gaz, là, côté avenue. Vous en faites quoi ?`),
      ], [`Le moniteur ajoute une quatrième victime, gênée par les gaz`]),
    ph('bilan', `Le bilan en dix secondes`,
      `L'hémorragie est arrêtée quand l'ambulance se range le long de la place de Fontenoy. L'équipage descend et vous regarde : nombre de victimes, état de chacune, gestes faits, heure du premier geste.`,
      FIN, [
        rad('SANTÉ 1', 'CENTRAL', `Sur place, place de Fontenoy. Je prends le bilan du premier intervenant.`, 'T'),
        voix('MONITEUR', `Dix secondes, pas une de plus. Ce que vous oubliez de dire, ils devront le redécouvrir.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Alerter les secours en moins de quarante secondes', 'personnalise', { target: 'alerte_secours', seconds: 40 }),
    ob('o2', 'Mettre le mannequin inconscient en position latérale de sécurité', 'soigner', { target: 'inconscient', count: 1 }),
    ob('o3', 'Arrêter l\'hémorragie par compression directe', 'soigner', { target: 'hemorragie', count: 1 }),
    os('o4', 'Refroidir la brûlure à l\'eau', 'soigner', { target: 'brulure', count: 1 }),
    os('o5', 'Transmettre aux secours un bilan complet des trois victimes', 'personnalise', { target: 'bilan_transmis', count: 3 }),
  ],
  failures: [fail('victime_non_secourue', 'Une victime n\'est pas prise en charge à temps.'), fail('temps', 'Les trois minutes de l\'atelier sont écoulées avant le bilan.', 180)],
  randomEvents: ['Le moniteur ajoute une quatrième victime, gênée par les gaz', 'La radio grésille pendant l\'alerte : il faut répéter le lieu', 'Un curieux veut relever le blessé inconscient'],
  unique: 'Seul atelier sans bouclier : alerter, protéger et secourir avant l\'arrivée de l\'ambulance.',
  tags: ['ecole', 'atelier', 'secours'],
});

export const ECOLE: MissionDef[] = [ECOLE_01, ECOLE_02, ECOLE_03, ECOLE_04];
