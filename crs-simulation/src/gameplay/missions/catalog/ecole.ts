/* =====================================================================================
 * Catalogue — l'école de formation (chapitre 0 de la carrière) : quatre ateliers de trois minutes.
 * Tenir la ligne, porter le bouclier, écouter et prononcer les sommations, premiers secours.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, intel, mission, ob, os, ph, T } from './dsl';
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
    `Cours de la caserne d'instruction, sur la place de l'École Militaire, par un matin d'automne clair. Un moniteur commande une section de seize élèves. Il n'y a ni foule ni danger : il s'agit d'apprendre le geste de base du maintien de l'ordre, la ligne de barrage.`,
    `Votre mission est de vous placer dans la ligne à soixante-dix centimètres de vos voisins, de la tenir pendant trois minutes et d'exécuter sans délai les commandements « En ligne ! », « Halte ! », « En avant, marche ! » et « Reformez ! ».`,
    `Écoutez le moniteur. Au commandement « En ligne ! », vous vous alignez sur le voisin de droite. Au commandement « Halte ! », vous vous immobilisez au pas. Le bouclier reste vertical, collé à celui du voisin. Un écart de plus de trente centimètres est signalé par une marque rouge au sol.`,
    `Ne tournez pas la tête, ne parlez pas, regardez devant vous. Vous pouvez recommencer l'atelier autant de fois qu'il le faut : seule la réussite compte pour passer au suivant.`,
  ],
  place: 'Place de l\'École Militaire', timeOfDay: 9, weather: 'clair', windFrom: 270, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ sections: 1, fourgons: 1 }),
  intel: intel('Aucune foule : exercice à blanc.', 'Aucun signalement.', ['Place de l\'École Militaire'],
    ['Aligner son bouclier sur le voisin de droite', 'Tenir la ligne à soixante-dix centimètres', 'Obéir aux commandements à la voix']),
  phases: [
    ph('mise-en-ligne', 'Mise en ligne', 'Le moniteur vous aligne : au commandement, vous prenez place dans la ligne.', T(60),
      [['MONITEUR', 'SECTION ICI MONITEUR. En ligne ! Boucliers ! PARLEZ.']], []),
    ph('tenue', 'Tenue de la ligne', 'Vous tenez la ligne pendant que le moniteur passe derrière vous.', T(120),
      [['MONITEUR', 'SECTION ICI MONITEUR. Tenez l\'alignement, ne bougez pas. TERMINÉ.']], []),
    ph('manoeuvre', 'Avancée et halte', 'En avant, marche ! Halte ! Reformez ! Trois évolutions à faire en ordre.', FIN,
      [['MONITEUR', 'SECTION ICI MONITEUR. En avant, marche ! Halte ! Reformez ! TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Tenir la ligne pendant deux minutes avec un écart inférieur à trente centimètres', 'tenir_position', { place: 'Place de l\'École Militaire', seconds: 120 }),
    ob('o2', 'Exécuter trois commandements à la voix en moins de deux secondes chacun', 'personnalise', { target: 'commandement', count: 3 }),
    os('o3', 'Réaliser la manœuvre sans faute d\'alignement', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Alignement rompu : atelier à refaire.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
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
    `Sur la pelouse du Champ-de-Mars, un petit groupe d'élèves s'entraîne sous la direction d'un moniteur. Des figurants lancent des projectiles de mousse pour simuler des jets. Le bouclier de police est lourd et se porte d'une certaine façon.`,
    `Votre mission est de porter le bouclier en position haute, moyenne et basse, de couvrir un collègue du second rang et de progresser en tortue sur dix mètres. Vous ne ripostez jamais : vous parez.`,
    `Position haute pour les jets venant du haut, moyenne face à la foule, basse contre les tirs ras. Dans la tortue, les deux rangs se serrent, les boucliers se touchent par-dessus les têtes. Avancez de dix mètres au pas, sans séparer vos boucliers.`,
    `Le bouclier est lourd : relevez-le en pliant les jambes. Gardez le menton baissé. Un projectile qui passe est une faute que le moniteur vous signalera.`,
  ],
  place: 'Champ-de-Mars', timeOfDay: 10, weather: 'nuageux', windFrom: 260, windSpeed: 2,
  crowd: crowd(30, '', 0.1, 0.1, 0, { curieux: 1 }, [], 0),
  forces: forces({ sections: 1, fourgons: 1 }),
  intel: intel('Trente figurants lançant des projectiles de mousse.', 'Aucun signalement.', ['Champ-de-Mars'],
    ['Plier les jambes pour relever le bouclier', 'Baisser le menton', 'Parer sans riposter']),
  phases: [
    ph('positions', 'Les trois positions', 'Haute, moyenne, basse : le moniteur commande, vous prenez la position.', T(60),
      [['MONITEUR', 'SECTION ICI MONITEUR. Bouclier haut ! Moyen ! Bas ! TERMINÉ.']], []),
    ph('jets', 'Jets de mousse', 'Les figurants lancent ; vous parez et couvrez le second rang.', T(120),
      [['MONITEUR', 'SECTION ICI MONITEUR. Couvrez le collègue derrière vous. TERMINÉ.']], ['Un projectile de mousse touche un élève']),
    ph('tortue', 'La tortue', 'Les deux rangs se serrent et avancent de dix mètres.', FIN,
      [['MONITEUR', 'SECTION ICI MONITEUR. Tortue, en avant, au pas. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Parer au moins quinze projectiles avec le bouclier', 'tenir_position', { count: 15 }),
    ob('o2', 'Avancer de dix mètres en tortue sans séparer les boucliers', 'personnalise', { target: 'tortue', count: 10 }),
    os('o3', 'Ne pas laisser passer plus de deux projectiles', 'limiter_blesses', { max: 2 }),
  ],
  failures: [fail('personnalise', 'Bouclier lâché : atelier à refaire.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
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
    `Esplanade des Invalides, un matin de brume. Quarante figurants jouent un attroupement. Le moniteur vous fait entendre les sommations telles qu'elles figurent dans l'article R. 211-11 du code de la sécurité intérieure, puis vous demande de les prononcer à votre tour.`,
    `Votre mission est d'écouter les trois formules réglementaires, de les répéter sans en changer un mot, puis de les prononcer dans l'ordre devant les figurants avec le mégaphone, en laissant une issue ouverte et un délai entre chaque annonce.`,
    `Première partie : écoutez l'annonce, la première sommation, la dernière sommation. Deuxième partie : prononcez-les. Le moniteur note chaque mot manquant. Laissez dix secondes entre deux sommations. Annoncez l'issue ouverte.`,
    `Les formules antérieures à 2021 sont périmées : seule la version actuelle est valable. Une sommation prononcée sans haut-parleur ne vaut rien. Un oubli d'une formule annule l'atelier.`,
  ],
  place: 'Esplanade des Invalides', timeOfDay: 10, weather: 'brouillard', windFrom: 270, windSpeed: 1,
  crowd: crowd(40, '', 0.3, 0.2, 0, { curieux: 1 }, [], 0),
  forces: forces({ sections: 1, fourgons: 1 }),
  intel: intel('Quarante figurants qui jouent un attroupement.', 'Aucun signalement.', ['Esplanade des Invalides'],
    ['Apprendre le texte mot pour mot', 'Laisser dix secondes entre deux sommations', 'Annoncer une issue ouverte']),
  phases: [
    ph('ecoute', 'Écoute', 'Le moniteur dit les trois formules ; vous les écoutez.', T(60),
      [['MONITEUR', 'ÉLÈVE ICI MONITEUR. Écoutez : Attention ! Attention ! Vous participez à un attroupement. Obéissance à la loi. Vous devez vous disperser et quitter les lieux. TERMINÉ.']], []),
    ph('repetition', 'Répétition', 'Vous répétez après le moniteur.', T(120),
      [['MONITEUR', 'ÉLÈVE ICI MONITEUR. Première sommation : nous allons faire usage de la force. Quittez immédiatement les lieux. Répétez. PARLEZ.']], []),
    ph('prononciation', 'Prononciation devant les figurants', 'Vous prononcez les trois formules d\'affilée au mégaphone.', FIN,
      [['MONITEUR', 'ÉLÈVE ICI MONITEUR. Dernière sommation : nous allons faire usage de la force. Quittez immédiatement les lieux. À vous. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Prononcer l\'annonce, la première puis la dernière sommation dans l\'ordre', 'sommations_regulieres', { count: 3 }),
    ob('o2', 'Prononcer chaque formule sans un mot manquant', 'personnalise', { target: 'texte_exact', count: 3 }),
    os('o3', 'Annoncer une issue ouverte avant la dernière sommation', 'prevention', { target: 'issue', count: 1 }),
  ],
  failures: [fail('personnalise', 'Une formule est oubliée : atelier à refaire.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Un figurant réclame la parole', 'Le mégaphone grésille'],
  unique: 'Les trois formules exactes de la loi : le moniteur corrige au mot près.',
  tags: ['ecole', 'atelier', 'sommations'],
});

export const ECOLE_04 = mission({
  ...ELEVE, poste: 'interpellation',
  id: 'ecole-04-premiers-secours',
  title: 'École — Premiers secours',
  pitch: 'Quatrième atelier : alerter, protéger, mettre en position latérale de sécurité et arrêter une hémorragie.',
  briefing: [
    `Place de Fontenoy, dans la cour de l'école d'application des secours. Un moniteur aligne trois mannequins : un inconscient, un blessé qui saigne, un agent brûlé au visage. Vous êtes dans la peau d'un gardien qui doit faire les premiers gestes avant l'arrivée des secours.`,
    `Votre mission est d'alerter les secours, de protéger les blessés, de mettre le mannequin inconscient en position latérale de sécurité, d'arrêter l'hémorragie par compression directe et de refroidir la brûlure à l'eau.`,
    `Alertez d'abord, par la radio. Protégez la zone. Puis dans l'ordre : l'inconscient qui respire (position latérale de sécurité), l'hémorragie (compression directe, pansement), la brûlure (eau pendant dix minutes simulées). Parlez au blessé pour le rassurer.`,
    `Ne déplacez jamais un blessé qui pourrait avoir une fracture du dos sans nécessité. Ne soulevez pas un vêtement collé à une brûlure. Les gants sont obligatoires.`,
  ],
  place: 'Place de Fontenoy', timeOfDay: 11, weather: 'couvert', windFrom: 250, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ sections: 1, fourgons: 1, pompiers: 1, samu: 1 }),
  intel: intel('Trois mannequins de secours.', 'Aucun signalement.', ['Place de Fontenoy'],
    ['Alerter avant tout', 'Protéger avant de soigner', 'Parler au blessé']),
  phases: [
    ph('alerte', 'Alerte', 'Vous alertez par radio et sécurisez la zone.', T(45),
      [['MONITEUR', 'ÉLÈVE ICI MONITEUR. Trois victimes, alertez les secours. PARLEZ.']], []),
    ph('geste', 'Gestes de secours', 'Position latérale, compression, refroidissement.', T(120),
      [['MONITEUR', 'ÉLÈVE ICI MONITEUR. Ordre des gestes : respiration, hémorragie, brûlure. TERMINÉ.']], []),
    ph('bilan', 'Bilan', 'Vous rendez compte aux secours dès leur arrivée.', FIN,
      [['SANTÉ 1', 'ÉLÈVE ICI SANTÉ UN. Bilan, nature, volume, attitude. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Alerter les secours en moins de quarante-cinq secondes', 'personnalise', { target: 'alerte', seconds: 45 }),
    ob('o2', 'Mettre le mannequin inconscient en position latérale de sécurité', 'soigner', { target: 'inconscient', count: 1 }),
    ob('o3', 'Arrêter l\'hémorragie par compression directe', 'soigner', { target: 'hemorragie', count: 1 }),
    os('o4', 'Refroidir la brûlure à l\'eau', 'soigner', { target: 'brulure', count: 1 }),
  ],
  failures: [fail('victime_non_secourue', 'Une victime n\'est pas prise en charge à temps.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Le moniteur ajoute une victime', 'La radio grésille pendant l\'alerte'],
  unique: 'Les premiers gestes de secours : sauver une vie vaut tous les gestes tactiques.',
  tags: ['ecole', 'atelier', 'secours'],
});

export const ECOLE: MissionDef[] = [ECOLE_01, ECOLE_02, ECOLE_03, ECOLE_04];
