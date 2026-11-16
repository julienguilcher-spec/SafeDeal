/* =====================================================================================
 * Catalogue — l'école de formation (chapitre 0 de la carrière) : quatre ateliers de trois minutes.
 * Tenir la ligne, porter le bouclier, écouter et prononcer les sommations, premiers secours.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, intel, mission, ob, os, ph, SOMMATIONS, T } from './dsl';
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
    ph('mise-en-ligne', 'Mise en ligne', 'La section sort de la colonne et se met en ligne. Vous prenez votre place, bouclier joint à celui du voisin de droite, à soixante-dix centimètres de lui.', T(40),
      [['MONITEUR', 'Section, en ligne ! Boucliers !']], []),
    ph('tenue', 'Tenue de la ligne', 'Le moniteur passe derrière le rang et corrige les écarts. Une marque rouge apparaît au sol dès que vous sortez de l\'alignement de plus de trente centimètres.', T(80),
      [['MONITEUR', 'Tenez l\'alignement. Regardez devant vous, pas vos pieds.']], ['Le moniteur fait reculer d\'un pas tout le rang']),
    ph('manoeuvre', 'Avancée, halte, reformation', 'Trois évolutions à faire en ordre : la ligne avance au pas, s\'arrête net au commandement, puis se reforme après une rupture volontaire.', FIN,
      [['MONITEUR', 'En avant, marche !'], ['MONITEUR', 'Halte ! Reformez !']], []),
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
    ph('positions', 'Les trois positions', 'Le moniteur commande, vous prenez la position : haute, moyenne, basse. Il attend une seconde entre deux ordres, pas davantage.', T(40),
      [['MONITEUR', 'Bouclier haut ! Moyen ! Bas !']], []),
    ph('jets', 'Jets de mousse', 'Trente figurants lancent des blocs de mousse à quinze mètres. Vous parez pour vous et pour le collègue du second rang, qui ne voit pas partir les jets.', T(80),
      [['MONITEUR', 'Couvrez le collègue derrière vous. Votre bouclier est aussi le sien.']], ['Un projectile de mousse touche un élève']),
    ph('tortue', 'La tortue', 'Les deux rangs se serrent, les boucliers du second rang passent au-dessus des têtes. La tortue avance de dix mètres au pas, sans qu\'aucun bouclier se sépare du voisin.', FIN,
      [['MONITEUR', 'Tortue ! En avant, au pas.']], []),
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
    ph('ecoute', 'Écoute', 'Le moniteur ceint l\'écharpe, lève le mégaphone et dit les trois formules dans l\'ordre : l\'annonce, la première sommation, la dernière sommation. Vous écoutez sans prendre de notes.', T(40),
      [['MONITEUR', SOMMATIONS.annonce], ['MONITEUR', SOMMATIONS.premiere], ['MONITEUR', SOMMATIONS.derniere]], []),
    ph('repetition', 'Répétition', 'Vous répétez chaque formule après le moniteur, sans mégaphone. Il vous arrête au premier mot changé et vous fait reprendre la phrase entière.', T(50),
      [['MONITEUR', 'À vous. Mot pour mot : la loi ne se résume pas.']], ['Le moniteur glisse une formule d\'avant 2021 pour voir si vous la relevez']),
    ph('prononciation', 'Devant les figurants', 'Écharpe en bandoulière, mégaphone en main, vous montrez l\'issue ouverte puis vous prononcez les trois formules face aux quarante figurants, en laissant quinze secondes entre chacune.', FIN,
      [['MONITEUR', 'L\'issue d\'abord, l\'annonce ensuite. Quinze secondes entre deux formules : comptez-les.']], []),
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
    ph('alerte', 'Alerte', 'Trois victimes au sol. Vous alertez par radio en donnant le lieu et le nombre de victimes, puis vous écartez les curieux pour protéger la zone.', T(40),
      [['MONITEUR', 'Trois victimes. Avant de toucher qui que ce soit : qui prévenez-vous, et que dites-vous ?']], []),
    ph('geste', 'Gestes de secours', 'Vous traitez dans l\'ordre : l\'inconscient qui respire est tourné sur le côté, la plaie est comprimée puis pansée, la main brûlée est refroidie à l\'eau.', T(90),
      [['MONITEUR', 'Dans l\'ordre : celui qui ne répond pas, celui qui saigne, celui qui a mal.']], ['Le mannequin inconscient cesse de respirer si vous le laissez sur le dos']),
    ph('bilan', 'Bilan aux secours', 'L\'ambulance arrive. Vous transmettez le bilan en moins de dix secondes : nombre de victimes, état de chacune, gestes faits, heure du premier geste.', FIN,
      [['SANTÉ 1', 'CENTRAL ICI SANTÉ UN. Sur place, place de Fontenoy. Je prends le bilan du premier intervenant. TERMINÉ.']], []),
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
