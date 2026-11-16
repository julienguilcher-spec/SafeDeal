/* =====================================================================================
 * Catalogue — commandant, suite (missions 8 à 15). Réexportées par commandant.ts, qui reste
 * le point d'entrée du rôle et y ajoute la campagne « semaine de mobilisation ».
 * ===================================================================================== */

import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, rad, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';

const CDT: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'commandant', poste: 'commandant_unite' };
const ADJ: Pick<MissionSpec, 'role' | 'rank' | 'poste'> = { role: 'commandant', rank: 'capitaine', poste: 'commandant_unite' };

/** Une heure du matin : fête et foule sur le quai (miroir : secouriste). */
export const CDT_08 = mission({
  ...ADJ,
  id: 'cdt-08-une-heure-du-matin',
  title: 'Une heure du matin',
  pitch: 'Fin de fête sur les quais de la Seine : deux mille fêtards, un pont, une nuit chaude et des secours qui doivent passer.',
  briefing: [
    `Fin de soirée de la Fête de la musique, quai de Conti et pont des Arts. Deux mille personnes restent sur les quais malgré la fermeture des débits. L'alcool, la chaleur et les haut-parleurs poussent la tension. Une bagarre éclate vers 1 h du matin, puis un groupe jette des bouteilles sur une patrouille.`,
    `Vous commandez la demi-compagnie : deux sections, des BRAV-M, un drone. Votre mission est de vider les quais sans heurts, de garder libre l'accès des secours et d'éviter qu'un mouvement de foule sur le pont Neuf ne fasse des blessés.`,
    `Section 1 sur le quai de Conti, section 2 sur le quai des Grands Augustins. Annonce au mégaphone toutes les dix minutes. Vous vous servez des escaliers des quais comme d'un entonnoir pour canaliser, jamais pour piéger. Les BRAV-M interviennent sur les bagarres. Les pompiers sont à demander dès les premiers malaises.`,
    `Pas de lacrymogène sur une foule en fête sur des quais étroits : un mouvement de panique vers la Seine serait dramatique. Privilégiez la parole, la lumière et la présence.`,
  ],
  type: 'evenement_festif', place: 'Quai de Conti', timeOfDay: 1, weather: 'clair', windFrom: 180, windSpeed: 1,
  crowd: crowd(2000, '', 0.3, 0.5, 0.03, { fetards: 0.7, etudiants: 0.15, curieux: 0.15 },
    ['Quai de Conti', 'Pont Neuf', 'Quai des Grands Augustins', 'Quai Voltaire'], 0.2),
  forces: forces({ sections: 2, fourgons: 6, bravm: 3, drone: true, pompiers: 2, samu: 2 }),
  intel: intel(
    'Deux mille fêtards, ambiance joyeuse devenant tendue après minuit ; beaucoup d\'alcool.',
    'Aucun groupe organisé ; quelques individus alcoolisés cherchent la bagarre.',
    ['Pont Neuf', 'Quai de Conti', 'Quai des Grands Augustins'],
    ['Demander des secours dès la première heure', 'Garder les escaliers des quais ouverts', 'Annoncer la fermeture des quais']),
  phases: [
    ph('fin-de-fete', `Les quais après la fermeture`,
      `Une heure du matin, quai de Conti. Les débits ont fermé, mais deux mille personnes restent sur les quais et le pont des Arts, bouteilles à la main, enceintes à fond. Vos deux sections sont en place de part et d'autre du Pont Neuf, casques à la ceinture ; la seule arme utile cette nuit est la voix.`,
      TENS(0.42), [
        rad('CENTRAL', 'MISTRAL', `Quais à vider avant DEUX heures. Pas de force sur une foule festive : présence, lumière, annonces.`, 'A'),
        rad('ICARE', 'MISTRAL', `DEUX MILLE personnes entre le pont des Arts et le Pont Neuf. Densité modérée, ambiance festive, quelques groupes très alcoolisés.`),
      ], [`Un fêtard grimpe sur la rambarde du pont des Arts`]),
    ph('rixe', `Rixe au pied de l'escalier`,
      `La tension monte d'un coup : une rixe éclate entre deux groupes au pied de l'escalier du quai de Conti, et des bouteilles volent vers la patrouille venue séparer. Autour, la foule recule en désordre vers le Pont Neuf ; à deux mètres du bord, une jeune femme s'est assise par terre, la tête entre les genoux.`,
      T(200), [
        rad('FAUCON 1', 'MISTRAL', `Rixe quai de Conti, UN-CINQ personnes, bouteilles lancées sur la patrouille. Je peux séparer, à votre ordre.`),
        rad('MISTRAL 1', 'MISTRAL', `Malaise d'une jeune femme au bord du quai, consciente. Je demande SANTÉ, je la garde.`),
      ], [`Une rixe éclate entre deux groupes`, `Malaise d'une jeune femme au bord du quai`, `Un fêtard tombe dans la Seine`]),
    ph('pont-neuf', `Le Pont Neuf se remplit`,
      `Ceux qui fuient la rixe et ceux qui arrivent du quai des Grands Augustins se croisent sur le Pont Neuf, dont les trottoirs se bouchent en une minute. La densité grimpe au-dessus de quatre personnes au mètre carré ; il faut fermer une entrée, ouvrir deux sorties et parler à la foule avant qu'elle ne pousse.`,
      FOULE('dispersion'), [
        rad('ICARE', 'MISTRAL', `Densité critique sur le Pont Neuf, plus de QUATRE personnes au mètre carré, côté rive gauche. Deux flux se croisent.`),
        rad('SAPEUR 1', 'MISTRAL', `Un camion de livraison bloque mon accès par la rue Dauphine. Il me faut un autre itinéraire jusqu'au quai.`),
      ], [`Mouvement de foule vers l'escalier du quai`, `Un camion de livraison bloque l'accès des secours`, `Un pétard est pris pour un coup de feu`]),
    ph('ecoulement', `L'écoulement vers le métro`,
      `La foule a commencé à partir. Par vagues, elle remonte du quai de Conti vers les stations Pont Neuf, Odéon et Saint-Michel ; les escaliers des quais servent d'entonnoir, jamais de piège. Quelques groupes s'attardent autour des enceintes : ce sont eux qu'il reste à convaincre.`,
      OBJ('o1'), [
        rad('MISTRAL 2', 'MISTRAL', `Quai des Grands Augustins : la foule s'écoule vers Saint-Michel, sans incident. Il me reste une centaine de personnes autour d'une enceinte.`),
        voix('FÊTARD', `Allez, commandant, une dernière chanson et on s'en va ! C'est la Fête de la musique, non ?`),
      ], [`Une sonorisation tombe en panne : son public se déplace d'un bloc vers le pont`]),
    ph('quais-vides', `Les quais rendus à la nuit`,
      `Les quais sont vides, de l'Institut de France au Pont Neuf, et les derniers fêtards remontent vers le boulevard Saint-Germain. Les pompiers font leurs comptes : malaises, chutes, coupures ; la salle, elle, veut d'abord savoir si quelqu'un a touché l'eau.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Quais vides, reçu. Bilan attendu : malaises, blessés, personnes tombées à l'eau, interpellations.`),
        rad('SAPEUR 1', 'MISTRAL', `Je vous transmets mon bilan des prises en charge dès que mes équipes sont regroupées quai de Conti.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Vider les quais sans emploi de la force', 'evacuer', { place: 'Quai de Conti' }),
    ob('o2', 'Prévenir toute compression grave sur le pont Neuf', 'limiter_blesses', { place: 'Pont Neuf', max: 3 }),
    os('o3', 'Traiter les malaises avec les secours en moins de quatre minutes', 'traiter_incidents', { target: 'malaise', count: 3 }),
    os('o4', 'Faire respecter l\'annonce toutes les dix minutes', 'sommations_regulieres', { count: 6 }),
  ],
  failures: [fail('trop_de_blesses', 'Mouvement de foule grave sur le pont.', 8), fail('victime_non_secourue', 'Une victime n\'est pas secourue à temps.')],
  randomEvents: ['Chute d\'un fêtard dans la Seine', 'Bagarre entre deux groupes', 'Un camion de livraison bloque l\'accès des secours', 'Panne de sonorisation'],
  unique: 'Pas de revendication, seulement une foule joyeuse qui peut basculer : la prévention vaut mieux que la force.',
  difficulty: 3, chapter: 5, altRoles: ['secouriste'], tags: ['fete', 'quais', 'miroir'],
});

/** La Seine monte : catastrophe naturelle sur les quais (miroir : secouriste). */
export const CDT_09 = mission({
  ...CDT,
  id: 'cdt-09-la-seine-monte',
  title: 'La Seine monte',
  pitch: 'La crue noie les berges, mille curieux s\'agglutinent sur les ponts et des riverains attendent les secours.',
  briefing: [
    `La Seine a franchi la cote d'alerte. Les berges basses sont noyées, les voies sur berge fermées. Les curieux se pressent sur le pont de l'Alma, le pont d'Iéna et le quai d'Orsay. Une dizaine de riverains refusent d'évacuer des péniches amarrées.`,
    `Vous commandez la compagnie, renforcée des pompiers de Paris. Votre mission est d'écarter les curieux des berges, d'ouvrir un couloir aux secours, d'évacuer les riverains récalcitrants et de garder les ponts ouverts aux véhicules de crue. Il n'y a pas d'ennemi : c'est un exercice de sang-froid.`,
    `Section 1 sur le quai d'Orsay, section 2 sur le quai Branly, sections 3 et 4 sur les ponts. Les pompiers viennent par la rue de l'Université. Le Centaure, haut sur roues, franchit les chaussées inondées pour atteindre les riverains isolés. Annoncez l'évacuation toutes les cinq minutes et organisez la circulation à pied.`,
    `L'eau monte de plusieurs centimètres par heure et le courant forcit : ne retardez pas une évacuation pour une négociation. Écartez les badauds avant qu'un enfant glisse. Aucune force : seulement des gestes et la voix.`,
  ],
  type: 'catastrophe', place: 'Quai d\'Orsay', timeOfDay: 9, weather: 'pluie', windFrom: 230, windSpeed: 7,
  crowd: crowd(1000, '', 0.1, 0.15, 0, { curieux: 0.6, riverains: 0.25, familles: 0.15 },
    ['Quai d\'Orsay', 'Pont de l\'Alma', 'Quai Branly', 'Pont d\'Iéna'], 0.2),
  forces: forces({ sections: 4, fourgons: 12, centaure: 1, drone: true, pompiers: 6, samu: 2 }),
  intel: intel(
    'Mille curieux, riverains inquiets ; la crue gagne les berges basses.',
    'Aucun radical ; risque de panique si l\'eau dépasse le quai.',
    ['Quai d\'Orsay', 'Pont de l\'Alma', 'Quai Branly'],
    ['Évacuer les péniches avant midi', 'Ouvrir un couloir aux secours sur le quai Branly', 'Écarter les curieux du bord de l\'eau']),
  phases: [
    ph('rampes', `Fermer les rampes des berges`,
      `Neuf heures, sous la pluie. La Seine a recouvert les berges basses du quai d'Orsay et l'eau lèche les premières marches des rampes ; un millier de curieux se penchent aux parapets et descendent photographier le courant. Il faut fermer chaque rampe et faire reculer tout le monde, à la voix et au geste.`,
      OBJ('o2'), [
        rad('CENTRAL', 'MISTRAL', `Crue de la Seine, cote d'alerte franchie. Fermez les accès aux berges, du quai d'Orsay au pont d'Iéna. Aucune force : il n'y a que des curieux.`, 'A'),
        rad('MISTRAL 1', 'MISTRAL', `Quai d'Orsay : une cinquantaine de personnes sont descendues sur la rampe pour photographier. L'eau est à leurs pieds.`),
      ], [`Un badaud s'obstine à photographier au bord du quai`, `La chaussée des rampes est glissante`]),
    ph('peniches', `Dix riverains sur leurs péniches`,
      `Les curieux sont remontés derrière les parapets. Quai Branly, dix riverains refusent de quitter leurs péniches, dont les amarres se tendent à chaque vague ; les pompiers arrivent par la rue de l'Université, et le Centaure, haut sur roues, peut franchir la chaussée inondée pour aller les chercher.`,
      OBJ('o1'), [
        rad('SAPEUR 1', 'MISTRAL', `Deux péniches à évacuer quai Branly, UN-ZÉRO personnes à bord. J'arrive par la rue de l'Université : il me faut le passage libre jusqu'au quai.`),
        rad('CENTAURE 1', 'MISTRAL', `Je peux franchir la chaussée inondée du quai Branly et ramener les riverains, à votre ordre.`),
        voix('RIVERAIN', `Trente ans que je vis sur ce bateau ! Il a tenu toutes les crues, je ne le laisse pas !`),
      ], [`Un riverain refuse de quitter sa péniche`, `Un chien tombe à l'eau`]),
    ph('pic', `Dix centimètres de plus`,
      `Les riverains sont à terre quand l'eau gagne encore dix centimètres et atteint le haut du quai Branly. Le périmètre doit reculer d'autant ; sur le pont de l'Alma, les curieux venus voir le niveau s'agglutinent contre le parapet, au-dessus du courant.`,
      T(240), [
        rad('CENTRAL', 'MISTRAL', `La cote vient de gagner UN-ZÉRO centimètres. Reculez votre périmètre et gardez les ponts ouverts aux véhicules de crue.`),
        rad('ICARE', 'MISTRAL', `Densité élevée sur le pont de l'Alma, côté amont : les gens se penchent au parapet pour voir le niveau.`),
      ], [`Un enfant glisse sur la berge`, `Un morceau de quai s'effondre`, `Panne radio de soixante secondes`]),
    ph('decrue', `Le niveau stagne`,
      `Vers la fin de la matinée le niveau stagne, puis commence à baisser sous la pluie fine. Les curieux se lassent et quittent les ponts ; restent les rampes à garder fermées, du quai d'Orsay au pont d'Iéna, et des riverains à qui il faudra dire quand ils pourront remonter à bord.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `La cote se stabilise. Maintenez les berges fermées jusqu'à nouvel ordre et rendez compte : évacués, blessés, incidents.`),
        rad('SAPEUR 1', 'MISTRAL', `Mes équipes restent quai Branly pour surveiller les amarres. Gardez-moi le couloir de la rue de l'Université.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Évacuer tous les riverains des berges basses', 'evacuer', { place: 'Quai Branly', target: 'riverain' }),
    ob('o2', 'Écarter la foule du bord de l\'eau', 'disperser', { place: 'Quai d\'Orsay' }),
    os('o3', 'Garder un couloir libre aux secours', 'proteger_site', { place: 'Rue de l\'Université' }),
    os('o4', 'Ne déplorer aucun blessé grave', 'limiter_blesses', { max: 1 }),
  ],
  failures: [fail('victime_non_secourue', 'Un riverain est emporté par l\'eau.'), fail('trop_de_blesses', 'Trop de blessés.', 6)],
  randomEvents: ['Un chien tombe à l\'eau', 'Panne radio de soixante secondes', 'Un badaud s\'obstine à photographier au bord du quai', 'Effondrement d\'un morceau de quai'],
  unique: 'Il n\'y a pas d\'adversaire : la mission se joue entre l\'eau, la foule et le temps.',
  difficulty: 2, chapter: 6, altRoles: ['secouriste'], tags: ['crue', 'catastrophe', 'miroir'],
});

/** Contre-manifestation : deux cortèges adverses à séparer. */
export const CDT_10 = mission({
  ...CDT,
  id: 'cdt-10-double-front',
  title: 'Double front',
  pitch: 'Deux comités défilent le même jour autour de l\'Opéra, l\'un pour, l\'autre contre le « Grand Axe » : être le mur qui ne penche d\'aucun côté.',
  briefing: [
    `Un projet d'urbanisme, le « Grand Axe », divise la ville. Le comité « Oui au Grand Axe » défile depuis la rue Scribe ; le comité « Non au Grand Axe » arrive par la rue Auber. Les deux cortèges ont déclaré place de l'Opéra, par erreur ou par provocation. Six cents personnes de chaque côté, avec des franges qui ne souhaitent que l'affrontement.`,
    `Vous commandez la compagnie : quatre sections, douze fourgons, un drone, un canon à eau. Votre mission est de maintenir une zone tampon de cent cinquante mètres entre les deux cortèges, de traiter chaque camp de la même façon et d'obtenir des dispersions décalées de vingt minutes.`,
    `Section 1 rue Scribe, section 2 rue Auber, section 3 sur le boulevard des Capucines, section 4 en réserve. Chaque camp envoie une trentaine de personnes par les rues latérales pour provoquer l'autre : coupez-les. Utilisez la liaison avec les deux organisateurs. Le canon à eau reste en retrait : sa vue seule calme parfois.`,
    `La neutralité est évaluée : l'écart d'emploi de la force entre les deux camps ne doit pas dépasser 20 %. Toute accusation de partialité, filmée, vous coûte la mission. Ne cédez pas aux cris d'un camp qui voudrait que vous chargiez l'autre.`,
  ],
  type: 'manifestation_declaree', place: 'Place de l\'Opéra', timeOfDay: 15.5, weather: 'nuageux', windFrom: 200, windSpeed: 3,
  crowd: crowd(1200, 'logement', 0.35, 0.6, 0.08, { militants: 0.3, riverains: 0.25, familles: 0.15, black_bloc: 0.08, curieux: 0.22 },
    ['Rue Scribe', 'Rue Auber', 'Place de l\'Opéra', 'Boulevard des Capucines'], 0.45),
  forces: forces({ sections: 4, fourgons: 12, canonEau: 1, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Douze cents personnes, six cents par camp ; ambiance tendue, jets de slogans.',
    'Une centaine de radicaux dans chaque camp, en franges.',
    ['Place de l\'Opéra', 'Rue Auber', 'Rue Halévy'],
    ['Fermer la rue Halévy', 'Prévoir une dispersion décalée', 'Demander l\'appui du drone aux deux cortèges']),
  phases: [
    ph('zone-tampon', `Cent cinquante mètres de vide`,
      `Place de l'Opéra, devant le palais Garnier. Le « Oui au Grand Axe » arrive par la rue Scribe, en orange, le « Non au Grand Axe » par la rue Auber, en violet : six cents personnes de chaque côté, et entre elles vos sections, qui tiennent cent cinquante mètres de chaussée vide.`,
      T(200), [
        rad('LIAISON', 'MISTRAL', `Les deux comités acceptent de rester chacun de leur côté. Chacun affirme que c'est l'autre qui a déclaré la place par provocation.`),
        rad('CENTRAL', 'MISTRAL', `Mission : vous interposer entre les deux cortèges. La salle suit l'équilibre de vos interventions, camp par camp.`, 'A'),
      ], [`Les deux cortèges se font face de part et d'autre de la zone tampon`]),
    ph('rues-laterales', `Trente personnes par la rue Halévy`,
      `Chaque camp détache une trentaine de personnes par les rues latérales pour aller provoquer l'autre : les orange par la rue Halévy, les violets par le boulevard des Capucines. Ils ne sont pas masqués et ne portent rien ; ils veulent être vus. Les couper, c'est déjà toucher à un camp : il faudra toucher à l'autre de la même façon.`,
      TENS(0.47), [
        rad('ICARE', 'MISTRAL', `TROIS-ZÉRO personnes du camp orange contournent par la rue Halévy. TROIS-ZÉRO du camp violet par le boulevard des Capucines. Jonction possible derrière l'Opéra dans DEUX minutes.`),
        rad('MISTRAL 4', 'MISTRAL', `Réserve disponible. Je peux couper la rue Halévy ou le boulevard des Capucines, pas les deux.`),
      ], [`Chaque camp envoie un groupe par les rues latérales`]),
    ph('jets-croises', `Les jets croisés par-dessus vos casques`,
      `La tension vient de franchir un seuil : des bouteilles, des œufs et des fumigènes passent par-dessus vos lignes dans les deux sens. Sur les marches du palais Garnier, place de l'Opéra, les spectateurs d'une matinée sortent en tenue de ville entre les deux foules, et de chaque côté on vous crie de charger ceux d'en face.`,
      T(240), [
        rad('MISTRAL 2', 'MISTRAL', `Jets croisés par-dessus ma ligne, rue Auber. Des deux côtés. J'attends vos ordres.`),
        voix('MANIFESTANT EN ORANGE', `Vous les protégez, eux ! Ça fait une heure que vous nous tournez le dos, à nous !`),
        rad('CENTRAL', 'MISTRAL', `Attention : une vidéo vous accuse de partialité. La salle compte vos interventions de chaque côté.`, 'T'),
      ], [`Des spectateurs sortent de l'Opéra entre les deux foules`, `Une accusation de partialité est filmée`, `Jets croisés par-dessus la ligne`]),
    ph('tenir-le-vide', `Quinze minutes sans contact`,
      `Tout tient à ce vide entre les deux camps, place de l'Opéra : tant qu'aucun groupe ne le traverse, il n'y a que du bruit. Le canon à eau est en retrait boulevard des Capucines, visible des deux côtés ; les interpellations, s'il en faut, se feront dans les deux camps ou dans aucun.`,
      OBJ('o1'), [
        rad('NEPTUNE 1', 'MISTRAL', `En retrait boulevard des Capucines, visible des deux cortèges. Je ne bouge que sur votre ordre.`),
        rad('MISTRAL 1', 'MISTRAL', `Rue Scribe : une dizaine d'individus du camp orange cherchent le contact. Faits constatés sur DEUX d'entre eux.`),
      ], [`Un groupe tente de traverser la zone tampon`]),
    ph('dispersions-decalees', `Vingt minutes d'écart`,
      `Quinze minutes sans contact : les organisateurs sont mûrs pour partir, à condition de ne pas partir en même temps. Il faut obtenir le départ d'un camp par le boulevard des Capucines, tenir l'autre vingt minutes rue Auber, et choisir lequel part le premier sans que cela ressemble à une faveur.`,
      FOULE('dispersion'), [
        rad('LIAISON', 'MISTRAL', `Le comité orange accepte de partir le premier. Le comité violet refuse d'attendre : il veut partir en même temps, ou avant.`),
        voix('ORGANISATRICE EN VIOLET', `Pourquoi eux d'abord ? Vous avez tiré au sort, ou vous avez choisi ?`),
      ], [`Un camp refuse la dispersion décalée`, `Panne radio de soixante secondes`]),
    ph('camp-par-camp', `Le décompte, camp par camp`,
      `Les deux cortèges se dispersent l'un après l'autre et la place de l'Opéra retrouve ses autobus. Sur le compte rendu, tout sera compté deux fois : les annonces, les refoulements, les interpellations, une colonne pour chaque camp, et l'écart entre les deux.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Dispersion constatée. Transmettez vos chiffres camp par camp : annonces, emplois de la force, interpellations.`),
        rad('LIAISON', 'MISTRAL', `Les deux comités demandent à être reçus séparément : chacun veut se plaindre de votre partialité envers l'autre.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Aucun contact entre les deux cortèges', 'tenir_position', { place: 'Place de l\'Opéra', seconds: 900 }),
    ob('o2', 'Traiter les deux camps de la même façon : moins de vingt pour cent d\'écart dans l\'emploi de la force', 'personnalise', { target: 'ecart_de_traitement_entre_camps', max: 20 }),
    os('o3', 'Interpeller dans les deux camps sur faits', 'interpeller', { count: 4 }),
    os('o4', 'Aucune vitrine brisée', 'limiter_degats', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Partialité manifeste, filmée.'), fail('ligne_enfoncee', 'Affrontement direct de plus de trente secondes.')],
  randomEvents: ['Accusation de partialité filmée', 'Spectateurs de l\'Opéra pris entre deux foules', 'Un camp refuse la dispersion décalée', 'Panne radio de soixante secondes'],
  unique: 'La neutralité devient une statistique mesurée et affichée au compte rendu.',
  difficulty: 4, chapter: 6, tags: ['contre-manifestation', 'neutralite'],
});

/* ------------------------------------------------------------------ anciennes missions du commissaire */

/** L'écharpe : constater, annoncer, sommer dans les formes (miroirs : manifestant radical, secouriste). */
export const CDT_11 = mission({
  ...CDT,
  id: 'cdt-11-l-echarpe',
  title: 'L\'écharpe',
  pitch: 'Quatre cents personnes restent place de la République après l\'ordre de dispersion : votre écharpe tricolore et votre mégaphone vont servir.',
  briefing: [
    `La manifestation déclarée est terminée depuis une heure ; quatre cents personnes restent sur la place de la République, dont une trentaine de radicaux qui montent sur la statue et jettent des projectiles sur les fourgons. Les commerçants du boulevard du Temple baissent leurs rideaux.`,
    `Vous commandez la compagnie et vous portez l'écharpe : vous êtes seul à constater l'attroupement, à annoncer, à sommer et à ordonner. Votre mission est de vider la place dans les formes de l'article R. 211-11, avec les trois annonces et sommations, avant tout emploi de la force.`,
    `Les sections 1 et 2 font face à la statue, la section 3 tient le boulevard Voltaire, la section 4 la rue du Temple. Vous montez sur le véhicule sonorisé, vous annoncez, vous laissez une issue ouverte vers la rue du Faubourg-du-Temple. Après la dernière sommation, vous réitérez avant tout emploi d'armes. Le compte rendu note l'heure de chaque annonce.`,
    `Aucune force avant la dernière sommation, sauf violences directes contre vos agents. Quatre-vingts pour cent de la place doivent être vidés avant le premier emploi de la force. Les mots sont dans la loi : ne les inventez pas.`,
  ],
  type: 'manifestation_declaree', place: 'Place de la République', timeOfDay: 19, weather: 'nuageux', windFrom: 280, windSpeed: 3,
  crowd: crowd(400, 'pouvoir_achat', 0.45, 0.5, 0.075, { syndical: 0.2, etudiants: 0.2, black_bloc: 0.1, curieux: 0.3, gilets_jaunes: 0.2 },
    ['Place de la République'], 0.3),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes sur la place, dont une trentaine de radicaux près de la statue.',
    'Trente individus déterminés, masqués, avec des projectiles prélevés sur un chantier.',
    ['Place de la République', 'Boulevard du Temple', 'Boulevard Voltaire'],
    ['Faire retirer les barrières de chantier', 'Prévoir une issue ouverte', 'Tenir le journal horodaté des sommations']),
  phases: [
    ph('constat', `Constater l'attroupement`,
      `Dix-neuf heures, place de la République. La manifestation déclarée a pris fin depuis une heure et les organisateurs ont appelé à la dispersion ; quatre cents personnes sont restées, dont une trentaine qui escaladent la statue et lancent des projectiles sur les fourgons. Deux raisons de constater l'attroupement, que vous seul pouvez prononcer.`,
      T(150), [
        rad('CENTRAL', 'MISTRAL', `Les organisateurs ont annoncé la dispersion à UNE-HUIT heures. Vous seul qualifiez. La salle note l'heure de chacune de vos annonces.`),
        rad('MISTRAL 1', 'MISTRAL', `Projectiles sur mes fourgons depuis le socle de la statue, TROIS-ZÉRO individus. Le reste de la place regarde.`),
      ], [`Un fumigène éclate devant la statue`, `Un groupe monte sur la statue`]),
    ph('issues', `Trois issues à vérifier`,
      `Avant de prendre le mégaphone, il faut regarder la place de la République comme la regardera un juge : par où ces gens peuvent-ils partir ? La rue du Faubourg du Temple doit rester ouverte ; le boulevard Voltaire et la rue du Temple sont tenus par vos sections. Une sommation devant une place fermée ne vaut rien.`,
      T(120), [
        rad('MISTRAL 3', 'MISTRAL', `Je tiens le boulevard Voltaire. Dois-je laisser sortir par chez moi, ou seulement par le Faubourg du Temple ?`),
        rad('ICARE', 'MISTRAL', `Issue du Faubourg du Temple libre. Des familles et des curieux stationnent loin de la statue, côté boulevard de Magenta : ils n'entendront pas un mégaphone.`),
      ], [`Une sono de manifestants couvre le mégaphone`, `Des familles restent à l'écart sans rien entendre`]),
    ph('trois-formules', `Les trois formules, de votre voix`,
      `Vous montez sur le véhicule sonorisé, face à la statue de la République, écharpe tricolore bien visible. L'annonce, puis la première sommation, puis la dernière : mot pour mot, avec le délai entre chacune, et la fusée rouge si le bruit couvre votre voix.`,
      OBJ('o1'), [
        voix('JOURNALISTE', `Commandant, vous allez donner l'ordre de charger ? Je vous filme : vous pouvez le dire à la caméra ?`),
        rad('MISTRAL 2', 'MISTRAL', `Mes agents sont prêts. Aucun mouvement de ma part avant votre dernière sommation et votre ordre.`, 'T'),
      ], [`Un journaliste filme le commandant pendant les sommations`, `Poubelles enflammées au pied de la statue`]),
    ph('quatre-sur-cinq', `Laisser le temps de partir`,
      `Les trois formules sont dites et notées au journal. La place commence à se vider par la rue du Faubourg du Temple : les curieux d'abord, puis les familles, puis ceux qui hésitaient. Tant que quatre personnes sur cinq ne sont pas parties, chaque geste de force serait prématuré ; autour de la statue, la trentaine ne bouge pas.`,
      OBJ('o2'), [
        rad('MISTRAL 3', 'MISTRAL', `La place se vide par le Faubourg du Temple, lentement. Il reste du monde côté boulevard Voltaire.`),
        rad('MISTRAL 1', 'MISTRAL', `Les TROIS-ZÉRO de la statue redoublent de projectiles. Riposte directe possible de mon côté. Vos ordres ?`),
      ], [`Un malaise dans la foule qui se retire`, `Rumeur d'un blessé grave relayée en ligne`]),
    ph('cessation', `Faire cesser dès que le trouble cesse`,
      `Quatre personnes sur cinq ont quitté la place de la République. Reste le noyau de la statue : contre lui la force est permise, dans les moyens et la limite que vous fixez, et elle doit s'arrêter à la seconde où il se disperse. La réitération de la dernière sommation précède tout usage des lanceurs.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Journal à jour : annonce et sommations horodatées. Si vous autorisez les armes, réitérez la dernière sommation et faites collationner.`),
        rad('MISTRAL 2', 'MISTRAL', `En ligne face à la statue. Moyens et limite à votre ordre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Prononcer l\'annonce puis les deux sommations dans les formes', 'sommations_regulieres', { count: 3 }),
    ob('o2', 'Vider quatre-vingts pour cent de la place avant tout emploi de la force', 'disperser', { place: 'Place de la République' }),
    os('o3', 'Laisser une issue ouverte pendant toute l\'opération', 'proteger_site', { place: 'Rue du Faubourg du Temple' }),
    os('o4', 'Tenir le journal horodaté complet', 'personnalise', { target: 'journal_horodate' }),
  ],
  failures: [fail('bavure_grave', 'Force employée avant la dernière sommation : faute lourde.'), fail('revocation', 'Sommations omises : retrait du commandement.')],
  randomEvents: ['Le mégaphone ne couvre pas toute la place', 'Un malaise dans la foule', 'Retour de gaz par vent tournant', 'Rumeur d\'un blessé grave relayée en ligne'],
  unique: 'Le texte exact des sommations est la mission : l\'écharpe pèse autant que le bouclier.',
  difficulty: 2, chapter: 7, altRoles: ['manifestant', 'secouriste'], tags: ['sommations', 'miroir', 'echarpe'],
});

/** Dialogue d'abord : liaison avec les organisateurs. */
export const CDT_12 = mission({
  ...CDT,
  id: 'cdt-12-dialogue-d-abord',
  title: 'Dialogue d\'abord',
  pitch: 'Un cortège de cinq mille personnes veut rallier l\'Hôtel de Ville par un trajet qu\'il n\'a pas déclaré : le meilleur ordre est celui qu\'on obtient en parlant.',
  briefing: [
    `Le « Collectif Lumière Pour Tous » proteste contre la hausse des tarifs de l'énergie. Cinq mille personnes se sont réunies place du Châtelet et veulent rallier l'Hôtel de Ville par le quai. Le trajet n'est pas déclaré. Le service d'ordre du collectif a pris contact avec votre équipe de liaison.`,
    `Vous commandez la compagnie. Votre mission est d'obtenir par le dialogue un changement de parcours, d'éviter tout recours à la force sur un cortège pacifique et de ramener la manifestation dans un cadre déclaré. Vous êtes seul décideur et pouvez accorder, refuser ou différer.`,
    `La liaison négocie : quatre points de passage, une durée de vingt minutes, un arrêt du camion sono. Les sections restent en réserve rue de Rivoli, casques à la ceinture. Si un incident survient, n'utilisez la force qu'en dernier recours.`,
    `La salle vous presse d'intervenir : vous n'avez pas à lui obéir, mais chaque décision d'attendre doit être motivée au compte rendu. Le renseignement vous presse d'agir : c'est à vous de décider si l'ordre public l'exige.`,
  ],
  type: 'manifestation_declaree', place: 'Place du Châtelet', timeOfDay: 16, weather: 'clair', windFrom: 250, windSpeed: 3,
  crowd: crowd(1000, 'pouvoir_achat', 0.3, 0.4, 0.03, { syndical: 0.3, familles: 0.2, retraites: 0.15, gilets_jaunes: 0.2, etudiants: 0.15 },
    ['Place du Châtelet', 'Quai de la Mégisserie', 'Quai de Gesvres', 'Place de l\'Hôtel de Ville'], 0.4),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq mille personnes déclarées ; ambiance sérieuse, quelques tensions autour du camion sono.',
    'Aucun bloc identifié ; quelques opportunistes à surveiller.',
    ['Place du Châtelet', 'Quai de Gesvres', 'Place de l\'Hôtel de Ville'],
    ['Ouvrir la liaison dès l\'arrivée', 'Préparer un parcours de délestage', 'Garder les sections hors de vue']),
  phases: [
    ph('rencontre', `La rencontre au pied de la fontaine`,
      `Place du Châtelet, au pied de la fontaine du Palmier. Le « Collectif Lumière Pour Tous » veut rallier l'Hôtel de Ville par les quais ; rien n'est déclaré, et la rue de Rivoli est en travaux. Trois responsables du service d'ordre vous attendent, bras croisés, à côté de votre officier de liaison.`,
      T(150), [
        rad('LIAISON', 'MISTRAL', `Contact établi avec le service d'ordre. Ils demandent le quai de Gesvres jusqu'à la place de l'Hôtel de Ville. Ils sont méfiants : ils veulent vous voir en personne.`),
        voix('RESPONSABLE DU COLLECTIF', `La dernière fois, on nous a promis un parcours et on a trouvé des boucliers au bout. Qu'est-ce qui a changé ?`),
        rad('CENTRAL', 'MISTRAL', `La salle recommande un barrage quai de la Mégisserie. La décision vous appartient.`),
      ], [`Un organisateur se montre méfiant`, `Une rumeur d'interdiction circule dans la foule`]),
    ph('conditions', `Quatre points de passage, vingt minutes`,
      `La négociation tient en quatre points : le quai de la Mégisserie puis le quai de Gesvres, vingt minutes de marche, le camion sono arrêté à l'entrée de la place de l'Hôtel de Ville, la dispersion annoncée par eux. Vos sections restent rue de Rivoli, casques à la ceinture ; un élu d'arrondissement vient d'arriver et veut être sur la photo.`,
      OBJ('o1'), [
        voix('ÉLU D\'ARRONDISSEMENT', `Commandant, je me porte garant de ces gens. Laissez-les passer par la rue de Rivoli, ce sera plus simple pour tout le monde.`),
        rad('LIAISON', 'MISTRAL', `Ils acceptent le quai et les vingt minutes. Ils bloquent sur le camion sono : ils veulent le garder jusqu'au parvis.`),
      ], [`Un élu local s'invite dans la négociation`, `La salle réclame un barrage`]),
    ph('marche-negociee', `Le quai de Gesvres, au pas`,
      `L'accord est passé. Le cortège s'ébranle sur le quai de la Mégisserie, familles et retraités en tête, et longe la Seine vers le quai de Gesvres ; vos sections suivent par la rue de Rivoli, hors de vue. Au milieu de la colonne, le service d'ordre a repéré une vingtaine de perturbateurs qu'il ne connaît pas.`,
      T(240), [
        rad('LIAISON', 'MISTRAL', `Le service d'ordre signale DEUX-ZÉRO perturbateurs au milieu du cortège. Il demande à s'en occuper lui-même, et que vous restiez à distance.`),
        rad('MISTRAL 1', 'MISTRAL', `Tête de cortège sur le quai de Gesvres, calme. Je suis en parallèle rue de Rivoli, invisible depuis le quai.`),
      ], [`Un groupe se détache du cortège`, `Une rumeur en ligne gonfle la tension`]),
    ph('camion-sono', `Le camion sono à l'entrée du parvis`,
      `À l'entrée de la place de l'Hôtel de Ville, le camion sono devait s'arrêter. Son chauffeur continue d'avancer vers le parvis, poussé par la foule qui chante ; les organisateurs courent à sa hauteur. Rien de grave encore : un accord qui se fissure, et vingt minutes qui s'achèvent.`,
      FOULE('dispersion'), [
        rad('MISTRAL 2', 'MISTRAL', `Le camion sono dépasse le point convenu et avance sur le parvis. Dois-je me montrer ?`),
        voix('RESPONSABLE DU COLLECTIF', `Deux minutes, commandant ! On le fait reculer nous-mêmes. Ne sortez pas vos gars, sinon je ne tiens plus personne.`),
      ], [`Le camion sono refuse de s'arrêter`]),
    ph('annonce-conjointe', `L'annonce conjointe`,
      `Sur le parvis de l'Hôtel de Ville, la dispersion s'annonce à deux voix : la responsable du collectif au micro du camion, vous à côté d'elle, écharpe en bandoulière et mégaphone baissé. Le quai de la Mégisserie n'attend plus que votre ordre pour rouvrir.`,
      FIN, [
        voix('RESPONSABLE DU COLLECTIF', `Merci à tous ! On se disperse dans le calme, par le métro et par le pont d'Arcole. Et merci à ceux qui nous ont laissés marcher.`),
        rad('CENTRAL', 'MISTRAL', `Dispersion annoncée par les organisateurs. Rouvrez le quai de la Mégisserie dès que la chaussée est libre, et motivez vos décisions d'attente au compte rendu.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Obtenir un parcours négocié par la liaison', 'prevention', { target: 'liaison', count: 1 }),
    ob('o2', 'Éviter tout emploi de la force pendant toute la mission', 'zero_bavure'),
    os('o3', 'Garder les sections hors de vue du cortège', 'personnalise', { target: 'discretion' }),
    os('o4', 'Rouvrir le quai de la Mégisserie dans les trente minutes', 'duree', { seconds: 1800 }),
  ],
  failures: [fail('bavure_grave', 'Force employée sur un cortège pacifique.'), fail('personnalise', 'Le cortège est bloqué sans motif.')],
  randomEvents: ['Un groupe se détache du cortège', 'Un camion sono refuse de s\'arrêter', 'La salle réclame un barrage', 'Une rumeur en ligne gonfle la tension'],
  unique: 'Une mission où l\'on gagne par le téléphone : chaque minute de dialogue vaut mieux qu\'une minute de lacrymogène.',
  difficulty: 2, chapter: 7, tags: ['liaison', 'desescalade'],
});

/** Autoriser ou attendre : manifestation déclarée qui dégénère (hôtel de ville). */
export const CDT_13 = mission({
  ...CDT,
  id: 'cdt-13-autoriser-ou-attendre',
  title: 'Autoriser ou attendre',
  pitch: 'La tension monte sur le parvis de l\'Hôtel de Ville : décider vite sans décider trop tôt.',
  briefing: [
    `Un rassemblement déclaré de deux mille personnes, les « Blouses Claires », réclame des effectifs hospitaliers sur le parvis de l'Hôtel de Ville. Peu après 18 h, un groupe de casseurs se mêle à la foule, des bouteilles volent, les services de l'hôtel de ville baissent les grilles.`,
    `Vous commandez la compagnie et assumez seul toute décision. Votre mission est de maintenir le rassemblement dans son cadre, de décider si et quand employer la force, et de protéger les soignants et les familles. La salle vous presse d'intervenir ; le terrain se calme par moments.`,
    `Deux sections face au parvis, une sur la rue de Rivoli, une sur l'avenue Victoria. Le drone surveille les casseurs. Si la tension monte, vous annoncez ; si elle retombe, vous attendez. Chaque minute gagnée évite un affrontement. Chaque minute perdue peut coûter une vitrine ou un blessé.`,
    `Vous n'avez à aucun moment l'obligation de réagir à un ordre venu de la salle : c'est votre responsabilité. Gardez toujours une issue vers la rue Saint-Martin. Ne chargez pas un cortège assis.`,
  ],
  type: 'manifestation_declaree', place: 'Place de l\'Hôtel de Ville', timeOfDay: 18, weather: 'couvert', windFrom: 260, windSpeed: 4,
  crowd: crowd(1200, 'hopital', 0.35, 0.65, 0.07, { soignants: 0.5, familles: 0.15, syndical: 0.15, black_bloc: 0.07, curieux: 0.13 },
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'], 0.4),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Deux mille personnes, majorité de soignants en blouse ; ambiance revendicative.',
    'Une quarantaine d\'individus en noir arrivent par la rue de Rivoli après 18 h.',
    ['Place de l\'Hôtel de Ville', 'Rue de Rivoli', 'Avenue Victoria'],
    ['Placer la réserve rue de Rivoli', 'Préparer l\'issue rue Saint-Martin', 'Garder le drone sur le groupe noir']),
  phases: [
    ph('blouses', `Les blouses sur le parvis`,
      `Dix-huit heures, place de l'Hôtel de Ville. Les « Blouses Claires » occupent le parvis en blouse bleu pâle, banderoles tendues, et scandent « Des bras pour soigner ! » sans un geste de trop. Deux sections leur font face à distance, une tient la rue de Rivoli, une l'avenue Victoria ; rien, pour l'instant, ne justifie autre chose que d'être là.`,
      TENS(0.45), [
        rad('CENTRAL', 'MISTRAL', `Rassemblement déclaré et calme : rien ne justifie la force à cette heure. Vous seul décidez.`, 'T'),
        rad('LIAISON', 'MISTRAL', `Les organisatrices annoncent la fin du rassemblement pour UNE-NEUF heures. Elles signalent des inconnus qui tournent autour du parvis.`),
      ], [`Des inconnus tournent autour du rassemblement`]),
    ph('groupe-noir', `Quarante silhouettes dans les blouses`,
      `La tension monte : quarante individus en noir se glissent entre les soignants par la rue de Rivoli, et les premières bouteilles partent du milieu des blouses vers vos lignes. Les grilles de l'Hôtel de Ville se baissent. Depuis le parvis, vous ne voyez que soixante mètres autour de vous ; le reste, c'est l'écran du drone.`,
      T(180), [
        rad('ICARE', 'MISTRAL', `Groupe de QUATRE-ZÉRO en tenue noire, entré par la rue de Rivoli, mêlé aux soignants côté fontaine. Jets de bouteilles depuis l'intérieur du rassemblement.`),
        rad('MISTRAL 2', 'MISTRAL', `Jets de bouteilles sur ma ligne, venus du milieu des blouses. Je ne peux pas riposter sans toucher les soignants. Je demande les lanceurs.`),
      ], [`Premiers jets de bouteilles depuis le rassemblement`, `L'image du drone se fige pendant vingt secondes`]),
    ph('pressions', `La salle presse, le terrain oscille`,
      `Deux voix dans la même oreille. La salle veut une intervention avant la nuit ; le chef de la section 2, lui, veut ses lanceurs. Sur le parvis de l'Hôtel de Ville, les soignants se sont assis en chantant pour ne pas être confondus avec les lanceurs de bouteilles, et la vitrine d'une agence vient de tomber rue de Rivoli.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `La salle suggère d'intervenir maintenant. La décision reste la vôtre : motivez-la.`),
        rad('MISTRAL 2', 'MISTRAL', `Je renouvelle ma demande de lanceurs. Ça tombe dru, mes agents s'impatientent.`),
        voix('SOIGNANTE', `On s'assoit ! Regardez, on est assis ! Ce n'est pas nous qui lançons, ne tirez pas sur nous !`),
      ], [`La vitrine d'une agence est brisée rue de Rivoli`, `Les soignants s'assoient sur le parvis`, `Un chef de section insiste pour obtenir les lanceurs`]),
    ph('agent-blesse', `Un agent à terre`,
      `Un pavé atteint un agent de la section 2 à la gorge, sous le casque : il est à terre, conscient, évacué par ses collègues vers l'avenue Victoria. La demande revient, plus pressante. Séparer les quarante des soignants reste possible sans un nuage : la liaison, l'issue de la rue Saint-Martin, des interpellations désignées par le drone, ou les sommations et un refoulement limité.`,
      OBJ('o2'), [
        rad('MISTRAL 2', 'MISTRAL', `URGENT. UN agent blessé à la gorge par un pavé, conscient. Évacuation vers l'avenue Victoria. Je redemande les lanceurs.`),
        rad('LIAISON', 'MISTRAL', `Les organisatrices proposent de déplacer leur rassemblement vers la rue Saint-Martin pour vous laisser le groupe noir. Elles attendent votre réponse.`),
        rad('ICARE', 'MISTRAL', `Les QUATRE-ZÉRO restent groupés près de la fontaine. Si les blouses s'écartent, ils seront seuls sur UN-CINQ mètres.`),
      ], [`Un agent est blessé par un pavé`, `Le vent tourne vers le rassemblement`]),
    ph('decision-tracee', `La décision au journal`,
      `Le groupe noir est seul devant vos lignes. Ce que vous décidez maintenant, attendre, interpeller, sommer ou autoriser, s'écrit au journal avec l'heure, les moyens et la limite ; et ce que vous autorisez doit cesser à l'instant où ces quarante-là se dispersent. À cent mètres, rue Saint-Martin, les soignants regardent.`,
      FOULE('dispersion'), [
        rad('CENTRAL', 'MISTRAL', `Journal ouvert. Toute autorisation : moyens, limite, heure. La salle enregistre.`),
        rad('MISTRAL 1', 'MISTRAL', `Groupe noir isolé devant ma ligne, soignants hors de portée. À vos ordres.`),
      ], [`Un journaliste se plaint d'être tenu à l'écart`, `Un malaise parmi les soignants`]),
    ph('compte-des-refus', `Ce que vous n'avez pas ordonné`,
      `La place de l'Hôtel de Ville se vide : les blouses repartent vers le métro par la rue de Rivoli, les derniers lanceurs de bouteilles par les quais. Le compte rendu comptera ce que vous avez ordonné, minute par minute, et aussi ce que vous avez refusé d'ordonner.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin de rassemblement constatée. Compte rendu attendu : décisions, heures, motifs, blessés des deux côtés.`),
        rad('LIAISON', 'MISTRAL', `Les organisatrices demandent à vous dire un mot avant de partir.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Maintenir le rassemblement sans emploi de la force sur les soignants', 'zero_bavure'),
    ob('o2', 'Séparer le groupe noir des soignants', 'disperser', { place: 'Place de l\'Hôtel de Ville' }),
    os('o3', 'Limiter les vitrines brisées à trois', 'limiter_degats', { max: 3 }),
    os('o4', 'Ne laisser aucun blessé parmi les soignants', 'limiter_blesses', { max: 0 }),
  ],
  failures: [fail('bavure_grave', 'Force employée sur les soignants.'), fail('trop_de_blesses', 'Trop de blessés.', 8)],
  randomEvents: ['La salle réclame d\'intervenir', 'Un malaise dans la foule', 'Un journaliste se plaint de l\'entrave', 'Averse soudaine'],
  unique: 'La mission se joue sur le chronomètre de la décision : agir trop tôt ou trop tard, les deux coûtent.',
  difficulty: 4, chapter: 7, tags: ['decision', 'hopital'],
});

/** Minuit sur le parvis : rassemblement spontané nocturne. */
export const CDT_14 = mission({
  ...CDT,
  id: 'cdt-14-minuit-sur-le-parvis',
  title: 'Minuit sur le parvis',
  pitch: 'À minuit, trois cents « Veilleurs » s\'installent sur le parvis de Notre-Dame sans déclaration : un rassemblement qui peut rester calme ou non.',
  briefing: [
    `Les « Veilleurs de Minuit », rassemblements nocturnes non déclarés, se retrouvent sur le parvis de Notre-Dame après l'annonce d'une décision gouvernementale. Trois cents personnes, bougies à la main, chantent doucement. Un petit groupe encagoulé s'infiltre vers minuit.`,
    `Vous commandez la compagnie. Votre mission est de garder le parvis ouvert, d'éviter tout incident près du monument et de décider seul s'il faut sommer ou laisser faire. Aucune interdiction n'est signée ; le droit de se rassembler pèse autant que l'ordre public.`,
    `Deux sections à distance sur le quai de la Corse, deux sections dans la rue de la Cité. Le drone surveille les arrivées. Vous gardez les secours et les accès au parvis. Parlez-leur avant de les sommer : ce sont des veilleurs, pas des émeutiers.`,
    `Les édifices voisins du parvis sont des sites sensibles : aucune dégradation ne sera tolérée. Un seul coup de trop sur un rassemblement silencieux serait filmé et diffusé dans l'heure.`,
  ],
  type: 'securisation', place: 'Parvis Notre-Dame - Place Jean-Paul II', timeOfDay: 23.5, weather: 'nuageux', windFrom: 200, windSpeed: 2,
  crowd: crowd(300, 'libertes', 0.3, 0.45, 0.05, { militants: 0.4, etudiants: 0.2, curieux: 0.3, black_bloc: 0.1 },
    ['Parvis Notre-Dame - Place Jean-Paul II', 'Rue de la Cité'], 0.15),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents veilleurs, bougies et chants ; une quarantaine d\'éléments encagoulés possibles.',
    'Un petit groupe de radicaux s\'insère après minuit.',
    ['Parvis Notre-Dame - Place Jean-Paul II', 'Rue de la Cité', 'Pont au Change'],
    ['Garder les secours accessibles', 'Ne pas encercler le parvis', 'Demander la liaison']),
  phases: [
    ph('veillee', `Trois cents bougies`,
      `Vingt-trois heures trente, parvis Notre-Dame. Trois cents « Veilleurs de Minuit » sont assis en cercles, une bougie à la main, et chantent à mi-voix face à la cathédrale. Aucune interdiction n'est signée ; vos sections attendent à distance, quai de la Corse et rue de la Cité, hors de la lumière.`,
      TENS(0.4), [
        rad('CENTRAL', 'MISTRAL', `Rassemblement non déclaré, aucun arrêté d'interdiction. Site sensible à proximité. Vous décidez.`, 'T'),
        rad('ICARE', 'MISTRAL', `TROIS-ZÉRO-ZÉRO personnes assises sur le parvis, calmes. Arrivées par petits groupes depuis le pont au Change et le Petit Pont.`),
      ], [`Un touriste fait voler un drone de loisir au-dessus du parvis`, `Un sans-abri dort contre une grille du parvis`]),
    ph('cagoules', `Vingt cagoules entre les cercles`,
      `Vers minuit, vingt individus encagoulés s'insèrent entre les cercles de bougies. Une poubelle prend feu contre une grille, côté rue de la Cité, et deux silhouettes escaladent une clôture pour s'approcher de la façade. Les veilleurs continuent de chanter ; certains se retournent, inquiets.`,
      T(200), [
        rad('ICARE', 'MISTRAL', `DEUX-ZÉRO individus encagoulés ont rejoint la foule par la rue de la Cité. Feu de poubelle contre une grille. Deux personnes franchissent une clôture, côté cathédrale.`),
        rad('MISTRAL 1', 'MISTRAL', `Je vois le feu depuis la rue de la Cité. Mon porte-extincteur peut y être en UNE minute, s'il traverse les veilleurs.`),
      ], [`Un feu de poubelle est allumé contre une grille`, `Deux individus escaladent une clôture près de la cathédrale`, `Des bougies sont renversées près d'une palissade`]),
    ph('parler-d-abord', `Parler avant de sommer`,
      `Ce sont des veilleurs, pas des émeutiers, et un mégaphone à minuit porte jusqu'au pont d'Arcole. Leur parler d'abord, leur montrer la rue de la Cité pour partir, puis aller chercher les auteurs désignés par le drone sans marcher sur les bougies : la moindre bousculade, sur ce parvis, sera filmée et diffusée dans l'heure.`,
      OBJ('o2'), [
        voix('VEILLEUSE', `Ils ne sont pas avec nous, ceux-là ! Si vous venez les chercher, ne nous marchez pas dessus : on reste assis.`),
        rad('ICARE', 'MISTRAL', `Trois auteurs identifiés : celui du feu et les deux de la clôture. Je les garde en visuel, ils restent en lisière, côté quai.`),
      ], [`Un groupe de veilleurs reste assis en chantant`, `Le bruit couvre le mégaphone : la fusée rouge s'impose`]),
    ph('pont-au-change', `Vers le pont au Change`,
      `Les auteurs désignés sont interpellés. Ce qui reste du groupe masqué quitte le parvis en courant par la rue de la Cité et le pont au Change, vers la rue de Rivoli ; les veilleurs, eux, soufflent leurs bougies une à une. La mission ne finit que lorsqu'il ne reste presque plus personne.`,
      FOULE('dispersion'), [
        rad('MISTRAL 3', 'MISTRAL', `Groupe de UN-CINQ individus masqués en fuite par le pont au Change, direction Châtelet. Je poursuis, ou je reste sur le parvis ?`),
        rad('CENTRAL', 'MISTRAL', `Une rame vient de déposer DEUX-ZÉRO-ZÉRO personnes à la station Cité. Elles montent vers le parvis.`),
      ], [`Une rame de métro déverse deux cents personnes`, `Un cortège sauvage part vers la rue de Rivoli`]),
    ph('parvis-eteint', `Les bougies éteintes`,
      `Le parvis Notre-Dame se vide par la rue de la Cité et les ponts ; il ne reste que des coulées de cire, une poubelle noircie et les projecteurs de la cathédrale. Avant de lever le dispositif, vos sections font le tour des grilles et des façades : chaque trace sera à signaler.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Rassemblement dispersé. Faites constater l'état des grilles et des façades, puis rendez compte.`),
        rad('MISTRAL 1', 'MISTRAL', `Tour du parvis en cours. Je vous rends compte de chaque dégradation relevée.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Garder le parvis libre de dégradations', 'proteger_site', { place: 'Parvis Notre-Dame - Place Jean-Paul II' }),
    ob('o2', 'Interpeller les auteurs de dégradations sur faits constatés', 'interpeller', { count: 3 }),
    os('o3', 'Ne recourir à la force qu\'après sommation', 'sommations_regulieres', { count: 3 }),
    os('o4', 'Laisser partir les veilleurs par la rue de la Cité', 'evacuer', { place: 'Rue de la Cité' }),
  ],
  failures: [fail('site_envahi', 'Le monument est dégradé.'), fail('bavure_grave', 'Force employée sur les veilleurs.')],
  randomEvents: ['Un touriste filme avec un drone', 'Bougies renversées près d\'une grille', 'Un SDF dort sur le parvis', 'Panne radio de soixante secondes'],
  unique: 'Un rassemblement silencieux où la moindre intervention se voit à des kilomètres : la nuit amplifie les gestes.',
  difficulty: 4, chapter: 7, tags: ['nuit', 'veilleurs'],
});

/** Le périmètre : sécurisation de site pour une visite. */
export const CDT_15 = mission({
  ...CDT,
  id: 'cdt-15-le-perimetre',
  title: 'Le périmètre',
  pitch: 'Un sommet à l\'Élysée, trois rues à fermer, un voisinage inquiet : tenir un périmètre sans que Paris étouffe.',
  briefing: [
    `Un sommet de chefs d'État se tient à l'Élysée. La rue du Faubourg-Saint-Honoré est fermée à la circulation. Un rassemblement déclaré de deux cents riverains inquiets se tient place Beauvau. Le renseignement signale un risque de dépassement par quelques individus.`,
    `Vous commandez la compagnie. Votre mission est de tenir un périmètre de sécurité de deux cents mètres autour du palais et du ministère de l'Intérieur, de laisser vivre le quartier, de faire passer les riverains, et d'éviter tout incident.`,
    `Section 1 rue du Faubourg-Saint-Honoré, section 2 place Beauvau, section 3 avenue Marigny, section 4 en réserve. Contrôles de pièce d'identité aux limites du périmètre. Vous laissez passer les riverains, vous bloquez les curieux. Le drone suit les arrivées par l'avenue Gabriel.`,
    `Les contrôles doivent être courtois : un riverain bloqué sans motif, c'est un reportage. Ne bloquez pas l'accès aux services de secours du quartier. Aucune interpellation sans fait.`,
  ],
  type: 'securisation', place: 'Rue du Faubourg Saint-Honoré', timeOfDay: 10, weather: 'clair', windFrom: 270, windSpeed: 3,
  crowd: crowd(300, 'libertes', 0.2, 0.35, 0.03, { riverains: 0.5, curieux: 0.3, militants: 0.2 },
    ['Place Beauvau', 'Rue du Faubourg Saint-Honoré', 'Avenue de Marigny'], 0.3),
  forces: forces({ sections: 4, fourgons: 12, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents riverains et curieux ; ambiance ordinaire.',
    'Quelques isolés peuvent forcer un contrôle.',
    ['Place Beauvau', 'Rue du Faubourg Saint-Honoré', 'Avenue Gabriel'],
    ['Placer des agents aux limites du périmètre', 'Prévoir un couloir de secours', 'Informer les riverains']),
  phases: [
    ph('plan', `Dessiner le périmètre`,
      `Dix heures. Autour de l'Élysée et de la place Beauvau, le périmètre de deux cents mètres n'existe encore que sur votre carte : où poser les barrages, où filtrer, par où laisser entrer les riverains et sortir les ambulances. Section 1 rue du Faubourg Saint-Honoré, section 2 place Beauvau, section 3 avenue de Marigny, la quatrième en réserve.`,
      T(200), [
        rad('CENTRAL', 'MISTRAL', `Périmètre à tenir de UN-ZÉRO heures à UN-DEUX heures. Arrivée des délégations à partir de UN-ZÉRO heures DEUX-ZÉRO.`, 'A'),
        rad('MISTRAL 3', 'MISTRAL', `En place avenue de Marigny. Où voulez-vous le point de filtrage des riverains ?`),
      ], [`Une livraison non annoncée se présente à un barrage`]),
    ph('delegations', `Douze voitures de délégations`,
      `Les voitures des délégations arrivent une à une par l'avenue de Marigny, escortées de motards. Aux filtrages, les riverains font la queue avec leurs justificatifs : une quittance, un badge d'immeuble, parfois rien du tout. Chaque refus sans motif fera un reportage ; chaque passage sans contrôle, une faille.`,
      OBJ('o2'), [
        rad('MISTRAL 2', 'MISTRAL', `Place Beauvau : file de riverains au filtrage. Un badge illisible, une dame sans justificatif qui dit habiter en face. Consignes ?`),
        voix('RIVERAINE', `J'habite ici depuis quarante ans, jeune homme. Il me faut un papier pour rentrer chez moi, maintenant ?`),
        rad('CENTRAL', 'MISTRAL', `Première délégation à UNE minute de l'avenue de Marigny. Aucun véhicule officiel ne doit attendre.`),
      ], [`Un badge de riverain est illisible`, `Un livreur sans autorisation tente de passer`, `Un journaliste réclame l'accès au périmètre`]),
    ph('petition', `Cinq riverains et une pétition`,
      `Place Beauvau, le rassemblement déclaré de deux cents riverains reste sur son trottoir. Cinq d'entre eux s'avancent jusqu'à la barrière avec une chemise cartonnée : ils veulent remettre une pétition à quelqu'un, n'importe qui, de l'autre côté. Rien ne vous oblige à dire oui ; rien ne vous oblige à dire non.`,
      T(240), [
        voix('PORTE-PAROLE DES RIVERAINS', `On ne demande pas à entrer. On demande que quelqu'un sorte prendre ce dossier. Cinq minutes, et on retourne sur notre trottoir.`),
        rad('LIAISON', 'MISTRAL', `Le cabinet accepte de recevoir la pétition à la barrière, si vous garantissez que la délégation ne dépasse pas CINQ personnes.`),
      ], [`Cinq manifestants demandent à remettre une pétition`, `Un colis suspect est signalé : fausse alerte`]),
    ph('avenue-gabriel', `Dix personnes par l'avenue Gabriel`,
      `Le drone suit dix personnes qui longent les jardins par l'avenue Gabriel, hors du rassemblement déclaré, et un scooter qui accélère vers le barrage de l'avenue de Marigny. Ce n'est peut-être rien ; c'est peut-être la tentative annoncée par le renseignement.`,
      T(220), [
        rad('ICARE', 'MISTRAL', `Groupe de UN-ZÉRO personnes sur l'avenue Gabriel, direction avenue de Marigny, pas de banderole. Un scooter les précède à vive allure.`),
        rad('MISTRAL 3', 'MISTRAL', `Scooter en approche rapide sur mon barrage. Il ne ralentit pas.`),
      ], [`Un scooter fonce vers un barrage`, `Un groupe tente de franchir le périmètre par l'avenue Gabriel`]),
    ph('levee', `Lever dans l'ordre inverse`,
      `Midi. Le sommet s'achève, les délégations repartent par l'avenue de Marigny et les riverains de la place Beauvau replient leurs pancartes. Le périmètre se lève dans l'ordre inverse de sa pose : les filtrages d'abord, les barrages ensuite, et la rue du Faubourg Saint-Honoré rendue aux livreurs.`,
      FIN, [
        rad('CENTRAL', 'MISTRAL', `Fin du sommet. Levez le périmètre après le départ de la dernière délégation et rendez compte : contrôles, refus, incidents.`),
        rad('MISTRAL 2', 'MISTRAL', `Place Beauvau : le rassemblement se disperse de lui-même. Je lève le filtrage à votre ordre.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir le périmètre pendant toute la durée du sommet', 'proteger_site', { place: 'Rue du Faubourg Saint-Honoré', seconds: 1500 }),
    ob('o2', 'Laisser passer les riverains munis de justificatif', 'prevention', { count: 20 }),
    os('o3', 'Ne procéder à aucun contrôle abusif', 'zero_bavure'),
    os('o4', 'Garder libre l\'accès des secours', 'proteger_site', { place: 'Rue de Surène' }),
  ],
  failures: [fail('site_envahi', 'Le périmètre est franchi.'), fail('bavure_grave', 'Un riverain est molesté.')],
  randomEvents: ['Un livreur sans autorisation tente de passer', 'Un journaliste réclame l\'accès', 'Colis suspect (fausse alerte)', 'Un scooter fonce vers un barrage'],
  unique: 'La mission de sécurisation par excellence : le calme est la réussite, et on la remarque à peine.',
  difficulty: 2, chapter: 7, tags: ['perimetre', 'protocole'],
});
