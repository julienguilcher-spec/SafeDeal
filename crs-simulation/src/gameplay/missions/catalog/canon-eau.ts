/* =====================================================================================
 * Catalogue — opérateur du canon à eau (engin lanceur d'eau « NEPTUNE ») : gradation de l'eau,
 * extinction des feux de rue, protection des tiers. Détachement facultatif (chapitre 10).
 * C'est le canon à eau qui éteint, pas le Centaure.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';

const OPE: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'operateur_canon_eau', rank: 'gardien', poste: 'operateur' };
const COND: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'operateur_canon_eau', rank: 'gardien', poste: 'conducteur' };

export const EAU_01 = mission({
  ...OPE, type: 'formation', duration: 'courte', difficulty: 1, chapter: 10,
  id: 'canon-01-dix-mille-litres',
  title: 'Dix mille litres',
  pitch: 'Apprendre la tourelle du canon à eau : pluie, jet diffus, jet droit, et économiser une cuve de dix mille litres.',
  briefing: [
    `Place de l'Alma, un matin froid. Un engin lanceur d'eau est garé devant le moniteur, cuve pleine, dix mille litres. Des cibles en carton jouent la foule. Aucune personne n'est présente. Vous apprenez la tourelle.`,
    `Votre mission est de maîtriser les trois modes de jet : la pluie, le jet diffus et le jet droit, de viser une cible à trente mètres, de gérer la consommation et de ne pas viser la tête. Vous êtes opérateur : le conducteur reste à son poste.`,
    `La pluie arrose large sans force ; le diffus repousse sans blesser ; le jet droit est interdit à moins de quinze mètres. Gardez le jet bas. Contrôlez le débit : à pleine puissance, les dix mille litres partent en onze minutes. Annoncez « Eau ! » avant de tirer.`,
    `Ne visez jamais la tête : un jet haut est une faute grave. Au moindre doute, réduisez le débit. Ne mouillez pas les câbles électriques.`,
  ],
  place: 'Place de l\'Alma', timeOfDay: 9, weather: 'clair', windFrom: 270, windSpeed: 1,
  crowd: crowd(0, '', 0, 0, 0, {}, [], 0),
  forces: forces({ canonEau: 1 }),
  intel: intel('Cibles en carton, aucune foule.', 'Aucun signalement.', ['Place de l\'Alma'],
    ['Garder le jet bas', 'Compter les litres', 'Annoncer avant de tirer']),
  phases: [
    ph('reglages', `La pluie, puis le diffus`,
      `Place de l'Alma, un matin froid. L'engin lanceur d'eau est rangé face à la Seine, cuve pleine : dix mille litres, soit onze minutes de jet à plein débit. Des silhouettes de carton figurent une foule à quinze, vingt et trente mètres ; vous commencez par la pluie, large et sans force, puis le diffus, par rafales de trois à dix secondes.`,
      T(70), [
        voix('MONITEUR', `L'eau, c'est une munition. Vous avez une jauge : vous la lisez avant chaque rafale, comme un chargeur.`),
        voix('CHEF D\'ENGIN', `Tourelle déverrouillée. Avant chaque jet, tu annonces : eau !`),
        voix('MONITEUR', `Rafales courtes. Trois secondes, tu regardes l'effet, tu recommences. Le jet reste bas.`),
      ], [`Un passant traverse le pas de tir`, `Un vent latéral couche le jet`]),
    ph('jet-droit', `Trois cibles à trente mètres`,
      `Dernier réglage : le jet droit, interdit à moins de quinze mètres et jamais au-dessus de la ceinture. Trois silhouettes à trente mètres, côté pont de l'Alma, à toucher une à une ; la pression chute à chaque rafale trop longue, et la jauge descend plus vite qu'on ne croit.`,
      OBJ('o1'), [
        voix('MONITEUR', `Jet droit, trente mètres, jambes et bassin. Celui qui monte à la tête recommence tout l'atelier.`),
        voix('CHEF D\'ENGIN', `Jauge ? Dis-moi le chiffre avant d'ouvrir de nouveau.`),
      ], [`La pression chute pendant une rafale`, `Le moniteur recule une cible de dix mètres`]),
    ph('feu', `Un feu de palette pour finir`,
      `Trois cibles touchées. Le moniteur fait allumer une palette au milieu de la place de l'Alma : l'engin est aussi le premier pompier d'une compagnie. Jet diffus au pied des flammes, puis lecture de la jauge ; ce qu'il reste dans la cuve dit comment vous avez tiré.`,
      FIN, [
        voix('MONITEUR', `Éteindre, c'est toujours permis. Arrosez la base, pas les flammes. Et dites-moi combien il vous reste.`),
        voix('CHEF D\'ENGIN', `Je veux le chiffre en litres, pas à peu près.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Toucher trois cibles à trente mètres avec le jet droit', 'personnalise', { target: 'cible_carton', count: 3 }),
    ob('o2', 'Garder plus de quatre mille litres après l\'exercice', 'personnalise', { target: 'reserve_eau', count: 4000 }),
    os('o3', 'Ne jamais viser la tête', 'zero_bavure'),
  ],
  failures: [fail('bavure_grave', 'Jet haut : faute grave.'), fail('temps', 'Temps d\'atelier dépassé.', 180)],
  randomEvents: ['Une cible tombe', 'Le moniteur change la distance'],
  unique: 'Trois jets pour un seul engin : savoir choisir la bonne gradation.',
  tags: ['formation', 'eau'],
});

export const EAU_02 = mission({
  ...OPE, type: 'manifestation_declaree', difficulty: 3, chapter: 10,
  id: 'canon-02-premiere-pluie',
  title: 'Première pluie',
  pitch: 'Après les sommations, vider la place de la Bastille par gradation : pluie, diffus, jet droit — aucune chute, aucun jet haut.',
  briefing: [
    `Place de la Bastille, fin de manifestation. Quatre cents personnes refusent de se disperser malgré les sommations ; une trentaine jettent des bouteilles. Le commandant a autorisé l'emploi de l'engin lanceur d'eau. Le vent d'ouest est faible.`,
    `Vous êtes opérateur : votre mission est de vider la place par gradation, en commençant par la pluie, puis le diffus, et le jet droit seulement en dernier recours. Aucune chute, aucun jet haut, aucun tiers touché.`,
    `Annoncez « Attention, usage du canon à eau. Reculez. » par le haut-parleur de l'engin. Pluie sur les premières lignes, diffus sur les groupes qui résistent, jet droit sur ceux qui lancent des projectiles, et sur eux seulement. Gardez le jet bas. Observez la foule : la gradation est faite pour être suivie.`,
    `L'eau fait glisser : une chute sur le pavé est une blessure. Ne visez jamais un journaliste ou un poste de soins. Un jet droit à moins de quinze mètres est interdit.`,
  ],
  place: 'Place de la Bastille', timeOfDay: 19, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(400, 'pouvoir_achat', 0.5, 0.55, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.2 },
    ['Place de la Bastille', 'Boulevard Henri IV', 'Rue de Lyon'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; une trentaine de lanceurs de bouteilles.',
    'Une trentaine d\'individus déterminés autour de la colonne de Juillet.', ['Place de la Bastille', 'Boulevard Henri IV'],
    ['Commencer par la pluie', 'Garder le jet bas', 'Épargner journalistes et soignants']),
  phases: [
    ph('avertissement', `L'avertissement au haut-parleur`,
      `Place de la Bastille, à la nuit tombante. Quatre cents personnes refusent de partir malgré les sommations ; une trentaine lancent des bouteilles depuis le pied de la colonne de Juillet. L'engin avance au pas derrière la ligne, tourelle au repos : avant toute goutte d'eau, il y a une phrase à dire au haut-parleur.`,
      T(120), [
        rad('MISTRAL', 'NEPTUNE 1', `Dernière sommation faite. Emploi de la force : engin lanceur d'eau, par gradation. Avertissez, puis pluie sur les premiers rangs.`, 'A'),
        voix('CHEF D\'ENGIN', `Micro. Tu annonces : attention, usage du canon à eau, reculez. Deux fois, lentement.`),
      ], [`Jets de bouteilles depuis le pied de la colonne`]),
    ph('pluie', `La pluie sur les premiers rangs`,
      `La tourelle s'oriente vers les premiers rangs et la pluie tombe, large et sans force, sur la chaussée de la place de la Bastille. Les curieux reculent aussitôt vers la rue de Lyon ; les pavés brillent, et un manifestant qui courait glisse de tout son long.`,
      TENS(0.6), [
        voix('CHEF D\'ENGIN', `Pluie, pas plus. Regarde ce qu'ils font : ceux qui partent, tu ne les suis pas avec le jet.`),
        rad('ICARE', 'NEPTUNE 1', `Un photographe de presse à DEUX-ZÉRO mètres devant votre tourelle, côté boulevard Henri IV. Il ne bouge pas.`),
      ], [`Un manifestant glisse sur le pavé mouillé`, `Un journaliste se tient dans l'axe du jet`]),
    ph('diffus', `Le diffus sur ceux qui restent`,
      `La pluie n'a pas suffi : la tension monte, et deux cents personnes restent serrées autour de la colonne de Juillet. Le jet diffus les repousse sans les renverser, à condition de rester bas et de ne pas insister sur un même point ; un poste de soins improvisé s'est installé sous un abribus, à gauche de la zone.`,
      T(180), [
        rad('MISTRAL 1', 'NEPTUNE 1', `Diffus devant ma ligne, TROIS-ZÉRO mètres. Pas sur l'abribus de gauche : il y a un poste de soins.`),
        voix('CHEF D\'ENGIN', `Jauge ? On a déjà mangé deux mille litres. Rafales courtes.`),
      ], [`La pression de la pompe baisse`, `Un poste de soins s'installe sous un abribus`]),
    ph('lanceurs', `Le jet droit, sur les seuls lanceurs`,
      `Il reste la trentaine du début, au pied de la colonne de Juillet, qui lance encore. Le jet droit est pour eux, et pour eux seulement : au-delà de quinze mètres, jamais au-dessus de la ceinture, par fenêtres de quelques secondes. Derrière eux, l'issue de la rue de Lyon est ouverte.`,
      OBJ('o1'), [
        rad('MISTRAL', 'NEPTUNE 1', `Jet droit sur les lanceurs de projectiles identifiés, à plus de UN-CINQ mètres. Issue libre rue de Lyon.`),
        voix('CHEF D\'ENGIN', `Celui qui lève le bras, capuche rouge. Lui, pas son voisin. Les jambes.`),
      ], [`Une brume d'eau retombe sur la ligne par vent tournant`, `Un lanceur se cache derrière des curieux`]),
    ph('place-trempee', `La place trempée`,
      `La place de la Bastille se vide par la rue de Lyon et les bouches du métro. Tourelle au repos, pompe coupée : il reste une chaussée trempée où l'on glisse encore, un poste de soins à laisser travailler, et une jauge à lire pour le compte rendu.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Halte à l'emploi de la force : le trouble a cessé. Rendez compte : litres consommés, incidents.`),
        voix('CHEF D\'ENGIN', `Tourelle dans l'axe, on verrouille. Combien il reste ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Vider la place de la Bastille par gradation', 'disperser', { place: 'Place de la Bastille' }),
    ob('o2', 'Ne causer aucune chute ni jet haut', 'zero_bavure'),
    os('o3', 'Garder plus de cinq mille litres', 'personnalise', { target: 'reserve_eau', count: 5000 }),
    os('o4', 'Épargner les journalistes et les soignants', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Jet à la tête.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Un manifestant glisse', 'Un journaliste dans la ligne de tir', 'Pression d\'eau en baisse', 'Retour de brume sur la place'],
  unique: 'Gradation : l\'eau est une force qui se dose, et se juge à l\'effet, pas à la puissance.',
  altRoles: ['journaliste', 'manifestant'], tags: ['gradation', 'miroir'],
});

export const EAU_03 = mission({
  ...OPE, type: 'protection_secours', difficulty: 3, chapter: 10,
  id: 'canon-03-barricade-en-feu',
  title: 'Barricade en feu',
  pitch: 'Une barricade de vélos électriques et de palettes brûle devant la ligne : l\'éteindre pour les pompiers, sous les jets de projectiles.',
  briefing: [
    `Rue Réaumur, nuit tombante. Une barricade de huit mètres de large brûle : palettes, poubelles et une dizaine de vélos et trottinettes en libre-service dont les batteries crépitent. Les pompiers ne peuvent pas approcher à cause des jets. Le canon à eau est le seul moyen d'éteindre.`,
    `Votre mission est d'éteindre la barricade avant qu'elle ne gagne la façade voisine, de protéger l'équipage des projectiles et de laisser le passage aux pompiers. Vous êtes opérateur : un extincteur ne suffit pas pour les batteries.`,
    `Arrosez le pied de la barricade en jet diffus. Les batteries se rallument parfois sous deux minutes : revenez dessus. Ne vous exposez pas à plus de dix secondes. Après extinction, laissez les pompiers refroidir.`,
    `Les batteries projettent des étincelles à trois mètres : restez dans la cabine grillagée. N'utilisez pas le jet droit sur une façade. Ne gaspillez pas l'eau : il vous reste quatre mille litres.`,
  ],
  place: 'Rue Réaumur', timeOfDay: 20, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, '', 0.55, 0.7, 0.3, { black_bloc: 0.3, curieux: 0.4, fetards: 0.3 },
    ['Rue Réaumur', 'Boulevard de Sébastopol'], 0.15),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, pompiers: 2, samu: 1 }),
  intel: intel(
    'Trois cents personnes ; une barricade en feu et des jets de projectiles.',
    'Une soixantaine d\'individus déterminés.', ['Rue Réaumur', 'Boulevard de Sébastopol'],
    ['Éteindre en jet diffus', 'Revenir sur les batteries', 'Protéger l\'équipage']),
  phases: [
    ph('approche', `Vingt-cinq mètres, sous protection`,
      `Rue Réaumur, à la nuit tombante. Une barricade de huit mètres brûle d'un trottoir à l'autre : palettes, poubelles, une dizaine de vélos et de trottinettes dont les batteries crépitent. Les pompiers ne peuvent pas approcher sous les jets ; l'engin avance derrière une section jusqu'à vingt-cinq mètres du foyer.`,
      T(100), [
        rad('MISTRAL', 'NEPTUNE 1', `Éteignez la barricade en feu rue Réaumur. Approche à DEUX-CINQ mètres derrière MISTRAL DEUX. Extinction seulement, pas de jet sur les personnes.`),
        voix('CHEF D\'ENGIN', `Il nous reste quatre mille litres. Tu arroses le pied, en diffus, et tu comptes.`),
      ], [`Des projectiles frappent la tourelle`]),
    ph('pied-du-foyer', `Le pied de la barricade`,
      `Jet diffus au pied des flammes, de gauche à droite, sans jamais monter sur les façades de la rue Réaumur. La fumée noire du plastique vire au blanc là où l'eau porte ; au premier étage, juste au-dessus du foyer, un riverain a ouvert sa fenêtre et fait de grands gestes.`,
      OBJ('o1'), [
        voix('CONDUCTEUR', `Fenêtre du premier, au-dessus du feu : il y a quelqu'un ! Ne monte pas le jet !`),
        rad('MISTRAL 2', 'NEPTUNE 1', `On signale une bouteille de gaz dans la barricade, côté droit. Si c'est confirmé, on recule tous à CINQ-ZÉRO mètres.`),
      ], [`Une bouteille de gaz est signalée dans la barricade`, `Un riverain se montre à sa fenêtre au-dessus du feu`, `Étincelles de batteries sur la tourelle`]),
    ph('rallumages', `Les batteries se rallument`,
      `La barricade de la rue Réaumur ne flambe plus, mais sous les palettes noyées les batteries des vélos repartent une à une, en gerbes d'étincelles, parfois deux minutes après avoir été arrosées. Il faut revenir dessus par rafales courtes, depuis la cabine grillagée, sans vider la cuve.`,
      OBJ('o2'), [
        voix('CHEF D\'ENGIN', `Ça repart à gauche ! Trois secondes dessus, pas plus. Jauge ?`),
        rad('SAPEUR 1', 'NEPTUNE 1', `Je suis au carrefour Sébastopol. Dès que ça ne lance plus, je viens refroidir. Gardez-moi un peu d'eau en attendant.`),
      ], [`Une batterie se rallume deux minutes après avoir été arrosée`, `La pression de la pompe baisse`]),
    ph('tenir-a-distance', `Tenir la foule loin des pompiers`,
      `Les rallumages sont traités et le fourgon des pompiers s'avance dans la rue Réaumur. Une cinquantaine de personnes reviennent vers la barricade noircie ; un jet diffus au sol, dix mètres devant elles, suffit à marquer la limite sans mouiller personne.`,
      T(180), [
        rad('MISTRAL', 'NEPTUNE 1', `Jet diffus au sol devant la ligne, pour tenir la distance pendant le travail des pompiers. Rien sur les personnes sans mon ordre.`),
        voix('SAPEUR-POMPIER', `Merci pour l'eau ! On refroidit et on tire les batteries à part. Ne coupez pas tout de suite.`),
      ], [`Un engin incendiaire éclate sur le flanc de l'engin`]),
    ph('restes', `Les restes de la barricade`,
      `Les pompiers noient les batteries une à une dans la rue Réaumur et la section tire les carcasses sur le trottoir. Pompe coupée ; il reste à lire la jauge et à regagner l'arrière, par le boulevard de Sébastopol, avant d'aller remplir.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Extinction terminée pour vous. Repli derrière la ligne, et rendez compte de votre réserve.`),
        voix('CHEF D\'ENGIN', `Combien de litres ? S'il en reste moins de deux mille, on va remplir avant d'y retourner.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éteindre la barricade avant qu\'elle ne gagne une façade', 'eteindre', { target: 'barricade_electrique', count: 1 }),
    ob('o2', 'Traiter les rallumages des batteries', 'eteindre', { target: 'rallumage', count: 2 }),
    os('o3', 'Garder plus de deux mille litres', 'personnalise', { target: 'reserve_eau', count: 2000 }),
    os('o4', 'Protéger l\'équipage des projectiles', 'survivre'),
  ],
  failures: [fail('personnalise', 'La façade voisine prend feu.'), fail('joueur_hors_combat', 'Équipage hors de combat.')],
  randomEvents: ['Étincelles de batteries', 'Un jet de cocktail sur l\'engin', 'Pression d\'eau en baisse', 'Un pompier demande de l\'eau'],
  unique: 'Les batteries se rallument : l\'eau, et non l\'extincteur, est la réponse.',
  tags: ['feu', 'batteries'],
});

export const EAU_04 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-04-le-pont-d-iena',
  title: 'Le pont d\'Iéna',
  pitch: 'Tenir le pont d\'Iéna avec un canon à eau en deuxième ligne : le pont est le piège de la Seine.',
  briefing: [
    `Pont d'Iéna, manifestation interdite. Près d'un millier de personnes veulent atteindre la Tour Eiffel depuis le Trocadéro. Le pont, large de trente-cinq mètres, est le seul accès. Votre engin est à l'arrière de la ligne de barrage.`,
    `Vous êtes opérateur : votre mission est d'appuyer la ligne sans gaz, d'utiliser l'eau en dernier recours après les sommations, de garder le pont ouvert à la retraite et de ne causer aucune chute dans l'eau.`,
    `La ligne tient la tête de pont. Vous êtes en retrait à vingt mètres. Au premier assaut, jet diffus à vingt mètres. En dernier recours, jet droit à trente mètres sur ceux qui lancent des projectiles. Gardez toujours un couloir de retraite vers le quai.`,
    `Le pont est étroit : une foule en fuite est un danger. Le jet est interdit à moins de vingt mètres de la balustrade. Ne poussez jamais la foule vers l'eau.`,
  ],
  place: 'Pont d\'Iéna', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 4,
  crowd: crowd(900, 'libertes', 0.5, 0.65, 0.12, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.1, curieux: 0.4 },
    ['Place du Trocadéro et du 11 Novembre', 'Pont d\'Iéna', 'Quai Branly'], 0.55),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Neuf cents personnes ; un goulot sur un pont de trente-cinq mètres.',
    'Une centaine d\'individus déterminés en tête.', ['Pont d\'Iéna', 'Place du Trocadéro et du 11 Novembre'],
    ['Garder un couloir de retraite', 'Ne pas pousser vers l\'eau', 'Jet bas']),
  phases: [
    ph('dissuasion', `Tourelle au repos`,
      `Pont d'Iéna, côté rive gauche. La ligne tient la tête de pont face au Trocadéro ; votre engin est vingt mètres derrière, tourelle au repos, bien visible. Près d'un millier de personnes descendent des jardins vers le pont : devant, des touristes qui ne comprennent pas ; au milieu, des familles ; quelque part, ceux qui veulent passer.`,
      TENS(0.6), [
        rad('MISTRAL', 'NEPTUNE 1', `Présence dissuasive, tourelle au repos. Aucun jet avant mes sommations. Couloir de retraite à garder libre vers le quai.`, 'A'),
        voix('CHEF D\'ENGIN', `On se montre, c'est tout. Si tu touches à la tourelle, tout le monde le verra.`),
      ], [`Des touristes sont pris entre la foule et la ligne`]),
    ph('poussee', `Cinquante en tête, les familles derrière`,
      `La tension monte : cinquante individus masqués prennent la tête et poussent sur la ligne, à l'entrée du pont d'Iéna, en lançant par-dessus les boucliers. Juste derrière eux, à moins de dix mètres, des familles et une banderole tenue par des retraités. Le commandant est sorti avec son mégaphone.`,
      T(200), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        rad('ICARE', 'NEPTUNE 1', `Lanceurs de projectiles en tête, CINQ-ZÉRO individus. Des familles à moins de UN-ZÉRO mètres derrière eux. Une poussette vide contre le parapet.`),
      ], [`Une poussette est abandonnée contre le parapet`, `Jets de projectiles par-dessus la ligne`]),
    ph('diffus-au-sol', `Le diffus au sol, puis les seuls lanceurs`,
      `Les sommations sont faites : l'eau est permise. Jet diffus au sol, vingt mètres devant la ligne du pont d'Iéna, pour marquer la limite ; puis, s'il le faut, jet droit à trente mètres sur ceux qui lancent, et sur eux seuls. Jamais vers le parapet, jamais de façon à pousser quelqu'un vers l'eau.`,
      OBJ('o1'), [
        rad('MISTRAL', 'NEPTUNE 1', `Dernière sommation faite. Emploi de l'engin : jet diffus au sol devant la ligne. Jet droit sur les lanceurs identifiés, sur mon ordre. Rien à moins de DEUX-ZÉRO mètres du parapet.`, 'C'),
        voix('CHEF D\'ENGIN', `Le type derrière la banderole, il lance. Mais la banderole, ce sont des retraités. Tu n'as pas la fenêtre : tu attends.`),
      ], [`Un lanceur de projectiles se cache derrière une banderole tenue par des pacifiques`, `Un manifestant tombe près du parapet`, `La pression de la pompe baisse`]),
    ph('reflux', `Le reflux vers le Trocadéro`,
      `Le pont d'Iéna a tenu un quart d'heure. La foule reflue vers les jardins du Trocadéro par le chemin qu'on lui a laissé ; sur le tablier mouillé, il reste une poussette, des banderoles et des flaques. Tourelle au repos : le jet s'arrête quand le trouble s'arrête.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Halte à l'emploi de la force. Tourelle au repos. Rendez compte : litres, nombre de jets droits, incidents près du parapet.`),
        voix('CHEF D\'ENGIN', `Regarde le parapet à la jumelle, d'un bout à l'autre. Dis-moi ce que tu vois.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir le pont d\'Iéna avec l\'appui de l\'eau', 'tenir_position', { place: 'Pont d\'Iéna', seconds: 900 }),
    ob('o2', 'Ne causer aucune chute dans la Seine', 'limiter_blesses', { max: 0 }),
    os('o3', 'Laisser un couloir de retraite libre', 'proteger_site', { target: 'couloir_retraite' }),
    os('o4', 'Employer l\'eau en dernier recours', 'zero_bavure'),
  ],
  failures: [fail('victime_non_secourue', 'Une personne tombe dans la Seine.'), fail('trop_de_blesses', 'Bousculade grave.', 8)],
  randomEvents: ['Un manifestant près de la balustrade', 'Pression d\'eau en baisse', 'Un journaliste dans le jet', 'Vent tournant'],
  unique: 'Un pont, la Seine à côté : l\'eau est ici une arme à manier avec une extrême prudence.',
  tags: ['pont', 'seine'],
});

export const EAU_05 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 3, chapter: 10,
  id: 'canon-05-deux-degres',
  title: 'Deux degrés',
  pitch: 'Manifestation interdite par grand froid : l\'eau gèle, la chaussée devient une patinoire et chaque litre est un risque.',
  briefing: [
    `Place du Trocadéro, mi-décembre, deux degrés et un vent glacial. Un rassemblement interdit de mille personnes occupe l'esplanade. Une couche de givre recouvre le pavé. La chaussée gèle sous l'eau.`,
    `Vous êtes opérateur : votre mission est de dire à votre commandant si l'eau est compatible avec le froid. Sous cinq degrés, un jet d'eau sur le pavé peut causer des chutes graves. Vous justifiez chaque usage et, au besoin, vous faites part de vos objections.`,
    `Contrôlez la température. Utilisez la pluie en dernier recours. Préférez la présence à la force. Si des chutes se produisent, cessez et demandez les secours. Tenez le journal horodaté de chaque décision.`,
    `Un jet d'eau à deux degrés sur la chaussée est un danger : refuser est possible et, parfois, nécessaire. Ne mouillez pas la chaussée à l'arrière de la foule. Les personnes âgées sont à protéger.`,
  ],
  place: 'Place du Trocadéro et du 11 Novembre', timeOfDay: 15, weather: 'brouillard', windFrom: 30, windSpeed: 6,
  crowd: crowd(1000, 'libertes', 0.35, 0.45, 0.06, { militants: 0.3, gilets_jaunes: 0.3, familles: 0.15, curieux: 0.25 },
    ['Place du Trocadéro et du 11 Novembre', 'Jardins du Trocadéro'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Mille personnes sur l\'esplanade ; froid vif, ambiance contenue.',
    'Aucun bloc ; quelques radicaux isolés.', ['Place du Trocadéro et du 11 Novembre', 'Jardins du Trocadéro'],
    ['Éviter l\'eau sous cinq degrés', 'Préférer la présence', 'Tenir un journal de décisions']),
  phases: [
    ph('givre', `Deux degrés sur l'esplanade`,
      `Place du Trocadéro, mi-décembre : deux degrés, un vent de nord-est qui coupe, du givre sur le pavé de l'esplanade. Mille personnes occupent le parvis malgré l'interdiction, serrées les unes contre les autres pour avoir moins froid. Dans la cabine, le thermomètre extérieur est la première chose que vous regardez.`,
      T(180), [
        rad('MISTRAL', 'NEPTUNE 1', `Rassemblement interdit place du Trocadéro. Vous êtes en appui. Température : DEUX degrés. Tenez un journal de chaque décision d'emploi, ou de refus.`),
        voix('CHEF D\'ENGIN', `À deux degrés, ce qu'on arrose gèle. Tu le sais, je le sais. On verra s'ils le savent, là-haut.`),
      ], [`Une personne âgée glisse sur le givre`]),
    ph('bouteilles', `Trois bouteilles par grand froid`,
      `Le rassemblement chante, piétine, souffle dans ses mains. Quelques bouteilles partent du fond de l'esplanade du Trocadéro vers la ligne, sans grande conviction ; des caméras de télévision tournent en direct depuis le parvis, face à la tour Eiffel.`,
      TENS(0.47), [
        rad('MISTRAL 1', 'MISTRAL', `Quelques jets de bouteilles sur ma ligne, auteurs isolés. Attitude générale calme. Je demande l'appui de l'engin pour refouler.`),
        voix('CONDUCTEUR', `Ils demandent l'eau pour trois bouteilles ? Par ce froid ?`),
      ], [`Une chaîne de télévision filme en direct`]),
    ph('ordre-d-appui', `L'ordre d'appui`,
      `La tension monte et l'ordre arrive : appuyer le refoulement avec l'engin. La pluie mouillerait tout le monde, par deux degrés ; le diffus au sol ferait une patinoire devant la ligne, sur le pavé du Trocadéro, pour la foule comme pour les CRS qui avanceront dessus. Employer, proposer autre chose ou refuser : chaque réponse s'écrit au journal, avec l'heure et le motif.`,
      OBJ('o2'), [
        rad('MISTRAL', 'NEPTUNE 1', `Appuyez le refoulement de MISTRAL UN : jet diffus au sol devant sa ligne.`),
        voix('CHEF D\'ENGIN', `C'est toi qui es à la tourelle. Si tu me dis que c'est dangereux, je le passe sur la fréquence, avec ton motif.`),
      ], [`Le givre gagne le bord des jardins`, `Une personne âgée se trouve au premier rang`]),
    ph('trempes', `Ceux qui tremblent`,
      `Vos décisions sont au journal. Sur l'esplanade du Trocadéro, le froid fait son œuvre de toute façon : des personnes tremblent, une femme âgée est assise par terre, les lèvres bleues, et partout où le pavé est mouillé, on tombe, manifestants et agents confondus.`,
      T(200), [
        rad('SANTÉ 1', 'MISTRAL', `Deux malaises dus au froid sur l'esplanade. Il me faut un accès et des couvertures. Ne mouillez plus rien.`),
        voix('CONDUCTEUR', `Regarde les collègues : ils patinent autant que ceux d'en face.`),
      ], [`Un malaise dû au froid`, `La chaussée mouillée gèle devant la ligne`, `Un agent glisse en avançant`]),
    ph('dispersion-au-froid', `Le froid disperse mieux que l'eau`,
      `La nuit tombe tôt et le thermomètre passe sous zéro. Le rassemblement se défait de lui-même, par petits groupes, vers les stations Trocadéro et Iéna ; les secouristes distribuent des couvertures. Dans la cabine, le journal de la tourelle tient en quelques lignes, heures et motifs.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Fin de mission. Transmettez votre journal : chaque emploi, chaque refus, avec l'heure et le motif.`),
        voix('CHEF D\'ENGIN', `On vidange la lance avant de rentrer, sinon elle gèle. Et tu signes ton journal.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Ne causer aucune chute due au verglas', 'limiter_blesses', { max: 0 }),
    ob('o2', 'Justifier chaque usage de l\'eau au journal', 'personnalise', { target: 'journal_decisions', count: 2 }),
    os('o3', 'Refuser un jet d\'eau inadapté au froid', 'zero_bavure'),
    os('o4', 'Protéger les personnes âgées', 'proteger_site', { target: 'personne_agee' }),
  ],
  failures: [fail('bavure_grave', 'Un jet cause une chute grave sur le verglas.'), fail('trop_de_blesses', 'Trop de chutes.', 4)],
  randomEvents: ['Une personne âgée glisse', 'Le givre gagne le bord du jardin', 'Un malaise dû au froid', 'Pression d\'eau gelée'],
  unique: 'La météo décide : l\'opérateur apprend à dire non.',
  tags: ['froid', 'verglas'],
});

export const EAU_06 = mission({
  ...COND, type: 'manifestation_interdite', duration: 'longue', difficulty: 3, chapter: 10,
  id: 'canon-06-a-sec',
  title: 'À sec',
  pitch: 'Onze minutes de jet dans la cuve pour tout un après-midi : économiser, ravitailler une fois, sans découvrir la ligne.',
  briefing: [
    `Avenue des Champs-Élysées, un après-midi d'émeute. Votre engin est le seul disponible, avec une cuve de dix mille litres, soit onze minutes de jet à plein débit. Le ravitaillement se fait sur une bouche d'incendie, à six cents mètres. La ligne de CRS compte sur vous pour l'appui.`,
    `Vous êtes conducteur : votre mission est de faire durer la cuve tout l'après-midi, de ravitailler une fois sans découvrir la ligne et de ne jamais rester à sec pendant un feu. L'opérateur tire, vous gérez la logistique.`,
    `Surveillez le niveau. À moins de deux mille litres, annoncez et demandez le ravitaillement. Quittez la ligne par la rue latérale, branchez-vous sur la bouche d'incendie, faites le plein en quatre-vingt-dix secondes, revenez. Laissez l'opérateur gérer le débit. Évitez le jet droit.`,
    `Une cuve vide pendant un feu est une faute. Un ravitaillement qui découvre la ligne est une faute. Rendez compte à votre commandant avant chaque départ.`,
  ],
  place: 'Avenue des Champs-Élysées', timeOfDay: 14, weather: 'couvert', windFrom: 260, windSpeed: 4,
  crowd: crowd(800, 'libertes', 0.55, 0.7, 0.2, { gilets_jaunes: 0.35, black_bloc: 0.2, syndical: 0.15, curieux: 0.3 },
    ['Avenue des Champs-Élysées', 'Rond-Point des Champs-Élysées - Marcel Dassault', 'Avenue Montaigne'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents personnes, assauts répétés sur la ligne.',
    'Deux cents individus déterminés.', ['Avenue des Champs-Élysées', 'Avenue Montaigne'],
    ['Surveiller la cuve', 'Ravitailler avant deux mille litres', 'Prévenir la ligne']),
  phases: [
    ph('premiere-vague', `Dix mille litres au départ`,
      `Avenue des Champs-Élysées, un après-midi d'émeute. Vous êtes au volant de l'engin, le seul disponible : dix mille litres dans la cuve, onze minutes de jet à plein débit. Derrière la ligne de CRS, à hauteur du Rond-Point, l'opérateur arrose la première vague ; vous, vous regardez la jauge et la rue par où il faudra sortir.`,
      T(300), [
        rad('MISTRAL', 'NEPTUNE 1', `Appui de la ligne par jets diffus, à la demande des chefs de section. Vous êtes le seul engin : gérez votre eau.`),
        voix('OPÉRATEUR', `Trois mille litres partis sur la première vague. À ce rythme, on tient deux vagues, pas trois.`),
      ], [`Un feu de poubelle prend contre une façade`]),
    ph('quart-de-cuve', `La jauge au quart`,
      `Deuxième vague, plus dense. La jauge passe sous le quart : deux mille cinq cents litres. La bouche d'incendie est avenue Montaigne, à six cents mètres ; partir maintenant, c'est découvrir la ligne au moment où elle recule, et rester, c'est risquer la cuve vide devant un feu.`,
      T(360), [
        voix('OPÉRATEUR', `Deux mille cinq cents. Si une voiture prend feu maintenant, je n'ai pas de quoi l'éteindre.`),
        rad('MISTRAL 2', 'NEPTUNE 1', `Jet diffus devant ma ligne, tout de suite ! Ils reviennent !`),
      ], [`La jauge passe sous le quart de cuve`, `Fuite sur un raccord de la cuve`]),
    ph('ravitaillement', `Six cents mètres jusqu'à la bouche d'incendie`,
      `Compte rendu passé, vous quittez la ligne par une rue latérale, sous escorte, vers la bouche d'incendie de l'avenue Montaigne. Brancher, ouvrir, attendre : le plein prend quatre-vingt-dix secondes si la bouche fonctionne, et pendant ce temps la ligne n'a plus d'eau derrière elle.`,
      OBJ('o2'), [
        rad('MISTRAL', 'NEPTUNE 1', `Reçu pour le ravitaillement. Escorte : un groupe de MISTRAL QUATRE. Faites vite, la ligne est découverte.`),
        voix('CHEF D\'ENGIN', `Bouche d'incendie à droite, après le kiosque. Colle-toi au trottoir, je descends brancher.`),
      ], [`La bouche d'incendie est masquée par un véhicule mal garé`, `L'escorte est en retard`]),
    ph('retour', `Le retour pendant la vague la plus forte`,
      `Cuve pleine. L'engin remonte vers l'avenue des Champs-Élysées au moment où la vague la plus forte arrive sur la ligne : barricade en feu, mortiers, deux sections qui reculent par échelons. Il faut revenir se placer derrière elles sans écraser personne ni rester coincé dans une rue latérale.`,
      T(300), [
        rad('MISTRAL', 'NEPTUNE 1', `Où êtes-vous ? Barricade en feu devant MISTRAL UN, j'ai besoin de vous maintenant.`),
        voix('OPÉRATEUR', `Je vois la fumée. Mets-moi à trente mètres, de face, je prends le feu d'abord.`),
      ], [`Une barricade en feu barre l'avenue`, `Des projectiles frappent la cabine au retour`]),
    ph('trente-minutes', `Tenir l'appui jusqu'au bout`,
      `Revenu derrière la ligne, l'engin reprend sa place et son rôle : éteindre ce qui brûle, marquer la distance, économiser. Les vagues s'espacent sur l'avenue des Champs-Élysées ; il reste à tenir l'appui jusqu'à la trentième minute, sans retomber sous les deux mille litres.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'NEPTUNE 1', `Restez derrière moi. Diffus au sol à ma demande seulement.`),
        voix('OPÉRATEUR', `Tu me préviens si tu dois bouger, je verrouille la tourelle avant.`),
      ], [`La pression de la pompe baisse`]),
    ph('jauge-finale', `Ce qu'il reste dans la cuve`,
      `Trente minutes d'appui. La foule quitte l'avenue des Champs-Élysées par les rues latérales et la ligne se resserre. Moteur au ralenti ; l'opérateur lit la jauge à voix haute, et vous notez pour la salle l'heure de chaque mouvement de l'engin.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Fin de l'appui. Rendez compte : litres consommés, heure du ravitaillement, durée de l'absence.`),
        voix('OPÉRATEUR', `Je te lis la jauge, tu notes. Et l'heure du plein, à la minute.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Rester en appui de la ligne pendant trente minutes, ravitaillement compris', 'tenir_position', { place: 'Avenue des Champs-Élysées', seconds: 1800 }),
    ob('o2', 'Ravitailler une seule fois sans découvrir la ligne', 'personnalise', { target: 'ravitaillement', count: 1 }),
    os('o3', 'Ne jamais rester à sec pendant un feu', 'personnalise', { target: 'cuve_vide_pendant_un_feu', max: 0 }),
    os('o4', 'Prévenir la salle à chaque mouvement', 'personnalise', { target: 'compte_rendu', count: 2 }),
  ],
  failures: [fail('personnalise', 'Cuve vide pendant un feu.'), fail('ligne_enfoncee', 'La ligne est découverte pendant le ravitaillement.')],
  randomEvents: ['Un feu de poubelle contre une façade', 'La borne est occupée', 'Fuite sur la cuve', 'Pression d\'eau en baisse'],
  unique: 'La logistique de l\'eau : on gagne en économisant.',
  tags: ['logistique', 'longue'],
});

export const EAU_07 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-07-brassards-blancs',
  title: 'Brassards blancs',
  pitch: 'Dans la foule, des brassards blancs : journalistes, observateurs, soignants. Les identifier avant d\'arroser.',
  briefing: [
    `Boulevard de Bonne Nouvelle, une manifestation interdite se disperse. Des groupes de brassards blancs sont mêlés à la foule : journalistes, observateurs d'une association, street medics. Ils ne sont pas des cibles. Un groupe violent est à leur contact.`,
    `Vous êtes opérateur : votre mission est d'arroser les violents sans toucher les brassards blancs. Vous devez identifier chaque brassard avant de tirer, à l'œil ou par la caméra de la tourelle.`,
    `Balayez la foule. Repérez les brassards à la jumelle. Tirez uniquement quand la zone est dégagée. Si un brassard apparaît dans le jet, coupez. Annoncez « Brassard ! » à voix haute pour prévenir votre binôme.`,
    `Le jet n'est pas sélectif : il faut attendre qu'un brassard sorte de la ligne de tir. Un journaliste touché, c'est une faute majeure. Les médecins ne doivent jamais être visés.`,
  ],
  place: 'Boulevard de Bonne Nouvelle', timeOfDay: 17.5, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(500, 'libertes', 0.5, 0.6, 0.15, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.15, curieux: 0.35 },
    ['Boulevard de Bonne Nouvelle', 'Boulevard Saint-Denis'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; vingt brassards blancs signalés.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard de Bonne Nouvelle', 'Boulevard Saint-Denis'],
    ['Identifier les brassards', 'Attendre une ligne de tir dégagée', 'Annoncer chaque brassard']),
  phases: [
    ph('jumelle', `Les brassards à la jumelle`,
      `Boulevard de Bonne Nouvelle, une manifestation interdite se défait. Dans la foule, des brassards blancs : journalistes, observateurs d'une association, secouristes de rue. À la jumelle depuis la tourelle, vous les comptez un par un ; ils ne sont pas des cibles, et un groupe violent s'est collé à eux.`,
      TENS(0.6), [
        rad('ICARE', 'NEPTUNE 1', `Groupe violent de QUATRE-ZÉRO, côté ouest du boulevard. Des brassards blancs à leur contact : j'en vois SIX, dont DEUX au sol près d'un blessé.`),
        voix('CHEF D\'ENGIN', `Tu annonces chaque brassard à voix haute. Je veux les entendre avant de voir partir l'eau.`),
      ], [`De la buée se forme sur la vitre de la tourelle`]),
    ph('ordre', `Quarante mètres à regagner`,
      `La tension monte et l'ordre tombe : repousser le groupe violent de quarante mètres, vers le boulevard Saint-Denis. Un jet d'eau n'est pas sélectif ; dans l'axe, un secouriste est penché sur un blessé, et un photographe travaille à cinq mètres des lanceurs.`,
      T(120), [
        rad('MISTRAL', 'NEPTUNE 1', `Repoussez le groupe hostile de QUATRE-ZÉRO mètres vers le boulevard Saint-Denis. Jet diffus, puis jet droit sur les lanceurs. Attention aux tiers.`),
        voix('CONDUCTEUR', `Brassard dans l'axe ! Le type accroupi, c'est un secouriste, il a quelqu'un par terre.`),
      ], [`Un secouriste est penché sur un blessé dans l'axe du jet`, `Un journaliste passe dans la ligne de tir`]),
    ph('fenetres', `Des fenêtres de deux à quatre secondes`,
      `Le jet ne part que lorsque la zone est nette : deux secondes, quatre au plus, puis on coupe et on regarde de nouveau. Au milieu du groupe violent du boulevard de Bonne Nouvelle, un homme porte un brassard blanc et lance des bouteilles ; le brassard ne fait pas le tiers, le geste fait le lanceur.`,
      OBJ('o2'), [
        voix('CHEF D\'ENGIN', `Fenêtre ! Deux secondes… coupe. Brassard à gauche, il revient dans l'axe.`),
        rad('ICARE', 'NEPTUNE 1', `Un individu avec brassard blanc lance des projectiles : fait filmé. Les autres brassards se sont écartés de UN-ZÉRO mètres vers le nord.`),
      ], [`Un lanceur de projectiles porte un faux brassard`, `Un brassard est arraché dans la bousculade`, `La pression de la pompe baisse`]),
    ph('cessation', `Refaire le compte des brassards`,
      `Le groupe violent a lâché le boulevard de Bonne Nouvelle et reflue vers le boulevard Saint-Denis. Tourelle au repos. À la jumelle, vous refaites le compte des brassards blancs, un par un : c'est la première chose qu'on vous demandera.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Halte au jet. Rendez compte : litres consommés, tiers atteints ou non.`),
        voix('CHEF D\'ENGIN', `Compte-les-moi. Les six du début, tu les retrouves tous ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Ne toucher aucun brassard blanc', 'zero_bavure'),
    ob('o2', 'Disperser le groupe violent avec l\'eau', 'disperser', { place: 'Boulevard de Bonne Nouvelle' }),
    os('o3', 'Annoncer chaque brassard repéré', 'reperer_signaux', { count: 5 }),
    os('o4', 'Consommer moins de quatre mille litres', 'personnalise', { target: 'litres_consommes', max: 4000 }),
  ],
  failures: [fail('bavure_grave', 'Un journaliste ou un soignant est touché par le jet.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Un journaliste passe dans la ligne de tir', 'Un brassard est arraché', 'Pression d\'eau en baisse', 'Un street medic se plaque contre un mur'],
  unique: 'L\'identification sous pression : la décision de ne pas tirer est la plus difficile.',
  tags: ['identification', 'tiers'],
});

export const EAU_08 = mission({
  ...OPE, type: 'protection_secours', difficulty: 3, chapter: 10,
  id: 'canon-08-pompier-malgre-lui',
  title: 'Pompier malgré lui',
  pitch: 'Cinq feux à éteindre avant qu\'ils ne gagnent les façades, sous jets de projectiles : le canon à eau devient lance.',
  briefing: [
    `Boulevard Haussmann, un après-midi d'émeute. Cinq feux sont allumés : deux poubelles, une barricade de palettes, un scooter, une trottinette électrique. Les pompiers sont retenus ailleurs. Le canon à eau est le seul moyen disponible.`,
    `Vous êtes opérateur : votre mission est d'éteindre les cinq feux avant qu'ils ne gagnent les façades. Les projectiles tombent sur l'engin. Le conducteur manœuvre : vous visez.`,
    `Hiérarchisez : scooter et trottinette d'abord (pneus qui éclatent, batterie qui s'embrase), puis barricade, puis poubelles. Jet diffus pour économiser. Reprenez sur chaque rallumage. Appelez les pompiers si un feu dépasse vos moyens.`,
    `Ne visez pas les façades. Le jet droit sur une trottinette peut projeter des éclats. Gardez la tourelle orientée vers la ligne en cas d'attaque.`,
  ],
  place: 'Boulevard Haussmann', timeOfDay: 16, weather: 'clair', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, '', 0.55, 0.65, 0.25, { black_bloc: 0.3, curieux: 0.4, gilets_jaunes: 0.3 },
    ['Boulevard Haussmann', 'Rue Tronchet', 'Rue de Caumartin'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, pompiers: 1, samu: 0 }),
  intel: intel(
    'Quatre cents personnes ; cinq foyers de feu.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard Haussmann', 'Rue Tronchet'],
    ['Hiérarchiser les feux', 'Jet diffus', 'Appeler les pompiers au besoin']),
  phases: [
    ph('cinq-feux', `Cinq feux, pas de pompiers`,
      `Boulevard Haussmann, un après-midi d'émeute. Cinq feux sur deux cents mètres : deux poubelles à l'angle de la rue Tronchet, une barricade de palettes, un scooter, une trottinette électrique. Les pompiers sont retenus ailleurs ; aujourd'hui, le premier pompier de la compagnie, c'est vous.`,
      T(90), [
        rad('MISTRAL', 'NEPTUNE 1', `CINQ foyers boulevard Haussmann, SAPEUR indisponible avant DEUX-ZÉRO minutes. Vous éteignez. Priorité à ce qui peut exploser.`),
        voix('CHEF D\'ENGIN', `Le scooter et la trottinette d'abord : réservoir, batterie. Les poubelles peuvent attendre.`),
      ], [`Des curieux filment au ras des flammes`]),
    ph('scooter-et-trottinette', `Ce qui peut exploser`,
      `Le scooter brûle contre un arbre du boulevard Haussmann, pneus déjà éclatés, réservoir intact. Dix mètres plus loin, la batterie de la trottinette crache des étincelles. Jet diffus pour économiser, jamais le jet droit sur une batterie : il projetterait des éclats sur les curieux.`,
      OBJ('o2'), [
        voix('CONDUCTEUR', `Pneu qui pète ! Ce n'est pas un tir, c'est le scooter. Reste dessus.`),
        rad('MISTRAL 2', 'NEPTUNE 1', `Je tiens les curieux à DEUX-ZÉRO mètres du scooter. Dites-moi quand je peux les laisser repasser.`),
      ], [`Un pneu éclate avec une détonation`, `La batterie de la trottinette se rallume`]),
    ph('palettes', `La barricade de palettes`,
      `Les deux foyers dangereux sont noyés. Reste la barricade de palettes, au milieu du boulevard Haussmann, dont les flammes montent à trois mètres et lèchent l'auvent d'un grand magasin. Arroser le pied, pas la façade ; et garder la tourelle prête à revenir vers la ligne, d'où partent de nouveaux pavés.`,
      T(200), [
        rad('MISTRAL', 'NEPTUNE 1', `La barricade menace une façade, traitez-la maintenant. Attention : ma ligne est prise à partie sur votre gauche.`),
        voix('CHEF D\'ENGIN', `Le pied des palettes, en diffus. Si tu touches la vitrine avec le jet droit, elle tombe.`),
      ], [`Un pavé frappe la cabine`, `Les flammes lèchent un auvent`]),
    ph('poubelles', `Les deux poubelles, et ce qui repart`,
      `Il reste les deux poubelles de l'angle de la rue Tronchet, et tout ce qui se rallume derrière vous : la batterie, une palette, un pneu. Cinq foyers, cela veut dire cinq foyers froids, pas cinq foyers mouillés ; la jauge, elle, est passée sous la moitié.`,
      OBJ('o1'), [
        voix('CHEF D\'ENGIN', `Ça fume encore au scooter. Retournes-y trois secondes avant de finir les poubelles.`),
        rad('SAPEUR 1', 'NEPTUNE 1', `Je me libère, je suis chez vous dans CINQ minutes par la rue de Caumartin. Dites-moi ce qu'il vous reste à traiter.`),
      ], [`Un foyer noyé se rallume`, `La pression de la pompe baisse`]),
    ph('relais-des-pompiers', `Le relais des pompiers`,
      `Cinq foyers froids. Le fourgon des pompiers débouche de la rue de Caumartin et reprend le boulevard Haussmann à son compte : refroidir, déblayer, vérifier les façades. L'engin recule derrière la ligne, tourelle de nouveau tournée vers la foule.`,
      FIN, [
        rad('SAPEUR 1', 'NEPTUNE 1', `Sur place. Je reprends les foyers, merci pour le travail. Indiquez-moi celui de la batterie.`),
        rad('MISTRAL', 'NEPTUNE 1', `Reprenez votre place derrière la ligne, et rendez compte de votre réserve.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éteindre cinq foyers avant qu\'ils gagnent une façade', 'eteindre', { count: 5 }),
    ob('o2', 'Traiter d\'abord les foyers à risque d\'explosion', 'traiter_incidents', { target: 'scooter', count: 2 }),
    os('o3', 'Garder plus de trois mille litres', 'personnalise', { target: 'reserve_eau', count: 3000 }),
    os('o4', 'Ne viser aucune façade', 'zero_bavure'),
  ],
  failures: [fail('personnalise', 'Une façade prend feu.'), fail('joueur_hors_combat', 'Équipage hors de combat.')],
  randomEvents: ['Un pneu éclate', 'Une batterie se rallume', 'Un jet de pavé sur l\'engin', 'Pression d\'eau en baisse'],
  unique: 'Le canon à eau n\'est pas qu\'un instrument de dispersion : c\'est d\'abord le premier pompier.',
  tags: ['feu', 'extinction'],
});

export const EAU_09 = mission({
  ...OPE, type: 'manifestation_interdite', difficulty: 4, chapter: 10,
  id: 'canon-09-tiers-proteges',
  title: 'Tiers protégés',
  pitch: 'Un groupe violent mêlé à des journalistes et à un poste de soins : n\'atteindre que les auteurs.',
  briefing: [
    `Place de la République, début de soirée. Un groupe de quarante individus violents occupe le pied de la statue. À dix mètres, une équipe de journalistes et un poste de soins improvisé d'une association de street medics. L'engin lanceur d'eau est à cinquante mètres.`,
    `Vous êtes opérateur : votre mission est de disperser le groupe violent sans toucher les journalistes ni les soignants. Un jet mal dirigé blesse un tiers et ruine l'image de la mission.`,
    `Repérez les tiers à la jumelle. Visez uniquement le groupe violent, jet bas. Utilisez la pluie d'abord. Au signal du chef, passez au diffus. Gardez l'œil sur le poste de soins : tout vent défavorable impose de couper.`,
    `Le vent d'ouest est faible mais peut porter le jet vers le poste de soins : attendez qu'il tombe. Un soignant gazé ou mouillé, c'est un reportage.`,
  ],
  place: 'Place de la République', timeOfDay: 18.5, weather: 'nuageux', windFrom: 270, windSpeed: 3,
  crowd: crowd(500, '', 0.55, 0.65, 0.2, { black_bloc: 0.2, gilets_jaunes: 0.25, syndical: 0.15, curieux: 0.4 },
    ['Place de la République', 'Boulevard du Temple'], 0.35),
  forces: forces({ sections: 2, fourgons: 6, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un poste de soins et une équipe de presse à dix mètres des violents.',
    'Quarante individus déterminés.', ['Place de la République', 'Boulevard du Temple'],
    ['Repérer le poste de soins', 'Commencer par la pluie', 'Tenir compte du vent']),
  phases: [
    ph('reperage', `Dix mètres entre les violents et la presse`,
      `Place de la République, en début de soirée. Quarante individus occupent le pied de la statue et lancent ce qu'ils trouvent. À dix mètres d'eux, une équipe de télévision ; un peu plus loin, sous une bâche, le poste de soins d'une association de secouristes de rue. L'engin est à cinquante mètres, tourelle au repos, et le vent d'ouest est faible.`,
      T(150), [
        rad('ICARE', 'NEPTUNE 1', `Groupe violent de QUATRE-ZÉRO au pied de la statue. Tiers à proximité : une équipe de presse à UN-ZÉRO mètres, un poste de soins à DEUX-ZÉRO mètres, sous le vent.`),
        voix('CHEF D\'ENGIN', `Tu repères la bâche du poste de soins et tu ne la quittes plus des yeux. C'est elle qui décide si on tire.`),
      ], [`Un journaliste s'avance vers le groupe violent`]),
    ph('pluie', `La pluie d'abord, jet bas`,
      `Avertissement au haut-parleur, puis la pluie, jet bas, sur le socle de la statue de la République. Le groupe se resserre et s'abrite derrière des parapluies ; l'équipe de télévision recule de quelques pas et continue de filmer, dos au poste de soins.`,
      T(180), [
        rad('MISTRAL', 'NEPTUNE 1', `Dernière sommation faite. Engin : pluie sur le groupe de la statue, uniquement. Diffus à mon signal.`, 'A'),
        voix('CONDUCTEUR', `La caméra recule vers la bâche. Ils sont en train de se mettre exactement où part ton eau.`),
      ], [`Un soignant traverse la zone avec un blessé`]),
    ph('vent', `Le vent tourne vers la bâche`,
      `Le vent fraîchit et tourne sur la place de la République : la brume du jet dérive maintenant vers la bâche du poste de soins, où deux personnes sont allongées. Rien n'est encore mouillé là-bas. C'est l'instant où l'on coupe, sans attendre l'ordre, et où on le dit.`,
      OBJ('o2'), [
        voix('CHEF D\'ENGIN', `Regarde ta brume. Elle part où, là ?`),
        rad('ICARE', 'NEPTUNE 1', `Votre brume dérive vers le poste de soins. Deux blessés allongés sous la bâche.`),
      ], [`Le vent pousse le jet vers le poste de soins`, `La pression de la pompe baisse`]),
    ph('diffus', `Le diffus, quand le vent retombe`,
      `Jet coupé, signalé, noté. Le vent retombe au bout d'une minute, et le groupe de la statue de la République relance de plus belle. Au signal, le diffus : court, bas, sur les quarante seulement, la main prête à couper de nouveau si la brume repart vers la bâche ou vers la caméra.`,
      OBJ('o1'), [
        rad('MISTRAL', 'NEPTUNE 1', `Reprenez quand le vent le permet. Diffus sur le groupe de la statue. Issue libre côté boulevard du Temple.`),
        voix('CHEF D\'ENGIN', `Vent tombé. À toi. Tu coupes à la première rafale, sans me demander.`),
      ], [`Un journaliste s'avance dans la zone du jet`, `Un lanceur se réfugie près du poste de soins`]),
    ph('bache-et-camera', `La bâche et la caméra`,
      `Le groupe violent quitte le pied de la statue par le boulevard du Temple. Tourelle au repos. Sous la bâche, les secouristes continuent leur travail ; l'équipe de télévision range sa caméra. Ce que vous direz au compte rendu tient en deux lignes : les litres, et qui a été mouillé.`,
      FIN, [
        rad('MISTRAL', 'NEPTUNE 1', `Halte à l'emploi de la force. Rendez compte : litres, coupures pour cause de vent, tiers atteints ou non.`),
        voix('CHEF D\'ENGIN', `Va voir la bâche à la jumelle. Je veux savoir si elle est sèche avant qu'on me le demande.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Disperser le groupe violent sans toucher un tiers', 'disperser', { place: 'Place de la République' }),
    ob('o2', 'Couper le jet au premier vent défavorable', 'personnalise', { target: 'coupure_vent' }),
    os('o3', 'Épargner le poste de soins', 'proteger_site', { target: 'poste_soins' }),
    os('o4', 'Épargner l\'équipe de presse', 'proteger_site', { target: 'presse' }),
  ],
  failures: [fail('bavure_grave', 'Un journaliste ou un soignant est touché.'), fail('trop_de_blesses', 'Trop de chutes.', 5)],
  randomEvents: ['Le vent pousse le jet vers le poste de soins', 'Un journaliste s\'avance', 'Un soignant traverse la zone', 'Pression d\'eau en baisse'],
  unique: 'Un jet d\'eau est imprécis : le tir sélectif est une discipline.',
  tags: ['tiers', 'selectif'],
});

export const CANON_EAU: MissionDef[] = [
  EAU_01, EAU_02, EAU_03, EAU_04, EAU_05, EAU_06, EAU_07, EAU_08, EAU_09,
];
