/* =====================================================================================
 * Catalogue — manifestant, profils radicaux (meneur, bloc, opportuniste) : missions 10 à 17.
 * Chaque mission montre le prix de ce qu'elle fait jouer ; les comportements sont décrits au niveau
 * du gameplay, sans mode d'emploi. Réexportées par manifestant.ts, point d'entrée du rôle.
 * ===================================================================================== */

import { crowd, fail, forces, FIN, FOULE, intel, mission, OBJ, ob, os, ph, scene, SOMMATIONS, T, TENS, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CDT_02, CDT_04, CDT_11 } from './commandant';
import { BRAVM_02 } from './bravm';

const base = (profile: NonNullable<MissionSpec['profile']>): Pick<MissionSpec, 'role' | 'rank' | 'poste' | 'profile'> =>
  ({ role: 'manifestant', rank: null, poste: null, profile });

export const MF_10 = mission({
  ...base('meneur'), ...scene(CDT_02), difficulty: 4, chapter: 13, mirrorOf: CDT_02.id, altRoles: ['commandant'],
  id: 'manifestant-10-le-signal',
  title: 'Le signal',
  pitch: 'En tête du précortège, vous donnez le signal : quelques minutes pour agir puis se fondre dans la foule avant l\'arrivée des forces de l\'ordre.',
  briefing: [
    `Boulevard du Temple, journée nationale d'action. Vous faites partie d'un petit groupe déterminé, en tête du cortège. Vous êtes noir de la tête aux pieds, avec un sac à dos. Un chef vous a désigné pour donner le signal du changement de comportement.`,
    `Votre mission est de rester dans le groupe, de donner le signal aux autres au bon moment, d'agir pendant quelques dizaines de secondes puis de vous replier et de vous fondre dans la foule avant l'arrivée des CRS. Vous jouez un rôle de meneur radical, dont les conséquences sont montrées.`,
    `Rassemblez-vous avec le groupe. Vérifiez vos protections. Au signal, avancez ensemble. Après trente à quatre-vingt-dix secondes, repliez-vous par les rues latérales. Changez de tenue à couvert. Rejoignez le cortège principal.`,
    `Le drone vous suit : chaque mouvement est observé. Une interpellation vous exposera à des poursuites. Ne vous séparez jamais du groupe pendant le repli. Le prix de chaque geste vous sera montré à la fin.`,
  ],
  intel: intel(
    'Huit mille marcheurs déclarés ; un précortège de trois cents personnes.',
    'Une centaine d\'individus déterminés dont vous faites partie.', ['Boulevard du Temple', 'Rue de Turbigo'],
    ['Rester groupé', 'Se replier avant les CRS', 'Se changer à couvert']),
  phases: [
    ph('bloc-en-tete', `Le bloc se forme en tête`,
      `Quinze heures, boulevard du Temple. Devant la banderole syndicale, une soixantaine de silhouettes en noir se regroupent sans se parler, capuches relevées, sacs sur le ventre. Vous en êtes, et le chef vous a mis un fumigène noir dans la main : c'est vous qui donnerez le signal. Au-dessus des toits, un drone tient un point fixe.`,
      T(150), [
        voix('CHEF', `Tu attends qu'on ait dépassé le premier carrefour. Pas avant. Quand la fumée monte, tout le monde avance.`),
        voix('CAMARADE', `Regarde en l'air. Il nous filme depuis le début. Garde ta capuche et ne lève pas la tête.`),
      ], [`Un drone se place en point fixe au-dessus de la tête du cortège`]),
    ph('signal', `Le fumigène dans la main`,
      `Le cortège avance sur le boulevard du Temple ; les familles sont à cinquante mètres derrière, avec les ballons et les poussettes. Le signal, c'est vous : trop tôt, le groupe n'est pas prêt ; trop tard, la ligne de CRS aura fermé les rues latérales. Autour de vous, on vous regarde, et on attend.`,
      OBJ('o1'), [
        voix('CHEF', `C'est quand tu veux. Mais si tu le fais, tu assumes : derrière, personne ne pourra dire qu'il ne savait pas.`),
        voix('SERVICE D\'ORDRE', `Les gars en noir, vous sortez du cortège ! Il y a des gamins derrière, on ne veut pas de ça chez nous !`),
      ], [`Un journaliste vous suit de près`, `Le service d'ordre syndical tente d'écarter le groupe`]),
    ph('soixante-secondes', `Soixante secondes dans le bloc`,
      `La fumée noire monte et le groupe avance d'un seul mouvement. Sur le boulevard du Temple, un panneau publicitaire tombe, une vitrine d'agence se fend, des pavés partent vers le carrefour. Ce que vous avez déclenché ne vous appartient plus : chacun fait ce qu'il veut, et le drone compte.`,
      TENS(0.55), [
        voix('CHEF', `Une minute, pas plus ! Après, on dégage !`),
        voix('MANIFESTANTE', `Arrêtez ! Vous êtes malades, il y a des enfants ! Vous allez nous faire gazer tous !`),
      ], [`Une vitrine d'agence est brisée`, `Un panneau publicitaire est abattu`]),
    ph('repli', `Les rues latérales`,
      `La tension vient de monter d'un cran : au bout du boulevard du Temple, les CRS sortent en ligne, et un mégaphone couvre le bruit. Le groupe se disloque vers la rue Béranger. Courir avec les autres, enlever le noir sous un porche, ressortir en quelqu'un d'autre : tout doit être fait avant que les rues se ferment. Un camarade, derrière vous, n'a pas suivi.`,
      T(150), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('CAMARADE', `Ils en ont pris un ! Ils l'ont plaqué au sol, je l'ai vu ! On ne peut rien faire, cours !`),
      ], [`Les CRS sortent en ligne`, `Un camarade est interpellé`]),
    ph('dans-la-foule', `Redevenir quelqu'un d'autre`,
      `De retour sur le boulevard du Temple, en veste claire, vous marchez parmi les retraités et les poussettes comme si de rien n'était. Devant, l'air pique encore et le cortège est arrêté ; une femme pleure, un enfant tousse. Personne ne vous regarde, sauf peut-être le drone, qui n'a pas bougé.`,
      FIN, [
        voix('MANIFESTANTE', `Vous avez vu ça ? Trois heures qu'on marche tranquillement, et à cause de soixante types on se fait gazer.`),
        voix('CHEF', `Tu rentres seul, tu ne parles à personne. Et celui qu'ils ont pris, tu ne le connais pas.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Donner le signal au bon moment', 'personnalise', { target: 'signal', count: 1 }),
    ob('o2', 'Se replier et se changer avant l\'arrivée des CRS', 'ne_pas_etre_interpelle'),
    os('o3', 'Rester avec le groupe pendant tout le repli', 'proteger_les_siens', { target: 'groupe' }),
    os('o4', 'Ne pas être repéré par le drone', 'ne_pas_etre_interpelle', { target: 'drone' }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
  randomEvents: ['Les CRS sortent en ligne', 'Un camarade est interpellé', 'Un drone passe au-dessus', 'Un journaliste vous suit'],
  unique: 'Vous passez de l\'autre côté de la ligne : comprendre l\'avant-garde radicale, avec ses conséquences.',
  tags: ['radical', 'bloc', 'miroir'],
});

export const MF_11 = mission({
  ...base('radical'), ...scene(CDT_04), difficulty: 4, chapter: 13, mirrorOf: CDT_04.id, altRoles: ['commandant'],
  id: 'manifestant-11-la-barricade',
  title: 'La barricade',
  pitch: 'Dresser un obstacle avec le mobilier disponible avant l\'arrivée de la ligne, sans mettre un riverain en danger.',
  briefing: [
    `Rue Saint-Honoré, nuit tombante. Vous êtes avec un petit groupe qui veut ralentir l'avancée des CRS. Le mobilier de la rue offre ce qu'il faut : poubelles, barrières, vélos en libre-service, palettes. La ligne arrive dans quatre minutes.`,
    `Votre mission est de dresser un obstacle en travers de la rue avec le mobilier disponible, avant l'arrivée de la ligne, sans mettre de riverain en danger. Il faut aussi éviter qu'un feu ne gagne une façade. Vous mesurerez les conséquences à la fin.`,
    `Rassemblez le mobilier. Placez les barrières en travers, puis les poubelles. Évitez de placer l'obstacle contre une façade. Si vous mettez le feu, gardez dix mètres de distance avec les immeubles. Prévenez les riverains aux fenêtres.`,
    `Un feu de barricade peut gagner un immeuble habité : c'est la limite. Les batteries de vélos électriques s'embrasent violemment : gardez vos distances. Une fois la ligne arrivée, repliez-vous.`,
  ],
  intel: intel(
    'Cinq cents personnes ; la ligne arrive dans quatre minutes.',
    'Une quarantaine d\'individus encagoulés.', ['Rue Saint-Honoré', 'Place Vendôme'],
    ['Rassembler le mobilier', 'Éviter les façades', 'Se replier à l\'arrivée de la ligne']),
  phases: [
    ph('mobilier', `Ce que la rue offre`,
      `Vingt et une heures trente, rue Saint-Honoré. La ligne de CRS remonte depuis la rue de Rivoli et sera là dans quatre minutes. Votre groupe veut la ralentir avec ce que la rue offre : des barrières de chantier, des poubelles, des palettes. Aux fenêtres, des habitants regardent, et certains crient.`,
      OBJ('o1'), [
        voix('CHEF', `Les barrières en travers, les poubelles derrière ! Au milieu de la rue, pas contre les immeubles !`),
        voix('RIVERAINE', `Il y a des gens qui dorment, ici ! Il y a des enfants au deuxième ! Allez faire ça ailleurs !`),
      ], [`Une riveraine crie depuis sa fenêtre`, `Un camarade traîne des vélos en libre-service vers l'obstacle`]),
    ph('feu', `Quelqu'un met le feu`,
      `L'obstacle barre la rue Saint-Honoré. Vous n'avez rien décidé, mais quelqu'un y a mis le feu, et les flammes montent plus vite que prévu : une batterie de vélo électrique s'embrase d'un coup, avec un sifflement. La façade la plus proche est à six mètres ; au premier étage, un rideau bouge.`,
      T(120), [
        voix('CAMARADE', `C'est trop près de l'immeuble ! Le vent rabat tout sur la façade ! Qui a allumé ça ?`),
        voix('RIVERAIN', `Vous allez mettre le feu à l'immeuble ! Ma mère est au troisième, elle ne peut pas descendre seule !`),
      ], [`Une batterie de vélo électrique s'embrase`, `Le vent rabat les flammes vers une façade`]),
    ph('ligne', `Trois minutes face à la ligne`,
      `Les boucliers apparaissent à l'angle de la rue des Pyramides, éclairés par les flammes. Derrière la fumée, le groupe lance ce qu'il trouve ; un mégaphone répète la même phrase. Au-dessus, le drone tourne, et un engin de pompiers attend, derrière la ligne, de pouvoir passer.`,
      TENS(0.68), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('CHEF', `On tient trois minutes et on file ! Personne ne reste seul !`),
      ], [`Le drone vous suit`, `Un engin de pompiers attend derrière la ligne`]),
    ph('issues', `Deux issues avant le bouclage`,
      `La tension monte et la ligne avance, au pas, derrière ses boucliers. Deux issues restent : la rue du Marché Saint-Honoré, étroite, et la place Vendôme, large et vide, où les motos de la police auront l'avantage. Dans votre dos, les pompiers s'approchent du brasier que vous laissez.`,
      T(150), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        voix('CAMARADE', `Par le marché ! Pas par la place, les motos y sont déjà ! Viens, on court !`),
      ], [`Des motos de police ferment la place Vendôme`, `Un pompier arrive au contact des flammes`]),
    ph('cout', `Ce que la rue garde de vous`,
      `Rue Saint-Honoré, il reste une tache noire sur la chaussée, du plastique fondu et une odeur âcre qui montera dans les étages toute la nuit. Vous marchez vite, les mains dans les poches, sans savoir si la façade a tenu ni si la vieille dame du troisième a pu descendre. Vous le saurez demain, par les journaux ou par une convocation.`,
      FIN, [
        voix('RIVERAINE', `Vous êtes fiers de vous ? C'est nous qui vivons ici ! C'est nous qui allons respirer ça !`),
        voix('CAMARADE', `On a tenu la rue dix minutes. Dix minutes. Tu crois que ça valait un immeuble ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Dresser l\'obstacle avant l\'arrivée de la ligne', 'personnalise', { target: 'barricade', count: 1 }),
    ob('o2', 'Ne mettre aucun riverain en danger', 'limiter_blesses', { target: 'riverain', max: 0 }),
    os('o3', 'Éviter que le feu gagne une façade', 'limiter_degats', { target: 'facade', max: 0 }),
    os('o4', 'Se replier avant d\'être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Feu gagnant une façade habitée.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un riverain crie depuis sa fenêtre', 'Une batterie de trottinette s\'embrase', 'Un pompier arrive', 'Le drone vous suit'],
  unique: 'La barricade vue de l\'intérieur : on mesure la responsabilité d\'un feu en pleine ville.',
  tags: ['radical', 'barricade', 'miroir', 'nuit'],
});

export const MF_12 = mission({
  ...base('radical'), ...scene(BRAVM_02), difficulty: 3, chapter: 13, mirrorOf: BRAVM_02.id, altRoles: ['bravm', 'telepilote'],
  id: 'manifestant-12-chat-et-souris',
  title: 'Chat et souris',
  pitch: 'Un cortège sauvage de quatre-vingts personnes poursuivi par des motos : atteindre trois cibles sans se faire prendre.',
  briefing: [
    `Boulevard Montmartre, la nuit. Vous êtes avec un groupe mobile d'une quatre-vingtaine de personnes, tenue sombre, sac à dos. Le groupe remonte les Grands Boulevards. Des motos de police suivent à distance et un drone vole au-dessus.`,
    `Votre mission est d'atteindre trois cibles désignées par le groupe (deux banques, une bijouterie) sans vous faire interpeller, en échappant aux motos et au drone. Vous êtes un manifestant radical dans un cortège sauvage.`,
    `Restez au centre du groupe. Changez de rue quand les motos s'approchent. Utilisez les passages couverts. Évitez les rues larges. Changez de vêtements à l'abri. Séparez-vous dès que le chef en donne l'ordre.`,
    `Les motos peuvent descendre vite et interpeller : ne restez jamais en queue de groupe. Le drone voit les couleurs : changez de veste. Ne mettez pas en danger les passants.`,
  ],
  intel: intel(
    'Quatre-vingts personnes en groupe mobile ; trois cibles.',
    'Soixante individus encagoulés.', ['Boulevard Montmartre', 'Boulevard des Italiens', 'Rue de la Paix'],
    ['Rester au centre du groupe', 'Changer de rue', 'Changer de tenue']),
  phases: [
    ph('quatre-vingts', `Quatre-vingts ombres sur le boulevard`,
      `Vingt-trois heures, boulevard Montmartre. Vous êtes quatre-vingts, en sombre, sacs au dos, à remonter les Grands Boulevards au pas de course, au milieu des terrasses et des sorties de théâtre. Six motos de la police suivent à cent mètres, sans gyrophare ; au-dessus, un bourdonnement ne vous lâche pas.`,
      T(120), [
        voix('CHEF', `On reste groupés, personne en queue ! Trois carrefours ce soir, deux suffiront. Au coup de sifflet, on tourne.`),
        voix('CAMARADE', `Tu entends le drone ? Il nous a depuis le début. Reste au milieu, ceux de derrière se font cueillir.`),
      ], [`Un drone passe au-dessus du groupe`]),
    ph('carrefours', `Trois carrefours, deux suffisent`,
      `Le groupe s'est fixé trois carrefours à tenir quelques minutes : celui de la rue du Faubourg Montmartre, celui de la rue Drouot, puis la place de l'Opéra. À chaque fois, des poubelles renversées, des voitures bloquées, des clients qui se lèvent des terrasses, et les motos qui se rapprochent. Entre deux, le passage Jouffroy et le passage des Panoramas coupent à travers les immeubles.`,
      OBJ('o1'), [
        voix('CHEF', `Les motos remontent par la droite ! On coupe par le passage, maintenant !`),
        voix('PASSANT', `Vous n'avez pas honte ? Il y a des gens qui travaillent, ici ! Rangez ça !`),
      ], [`Une moto surgit d'une rue latérale`, `Un passant se plante devant le groupe`]),
    ph('motos-devant', `Les motos passent devant`,
      `Deux carrefours ont été tenus. Boulevard des Italiens, les motos ne suivent plus : elles ont doublé par une rue parallèle et barrent le trottoir cinquante mètres plus loin, passagers à terre. Derrière vous, la queue du groupe se fait saisir, un par un. Le chef siffle deux fois.`,
      T(100), [
        voix('CAMARADE', `Ils ont eu ceux de derrière ! Trois, au moins ! Ne te retourne pas !`),
        voix('CHEF', `On éclate ! Par deux, par trois, chacun sa rue ! On ne se connaît plus !`),
      ], [`Un camarade est interpellé`, `Les motos barrent le boulevard`]),
    ph('se-fondre', `Se défaire du noir`,
      `Rue de la Paix, sous un porche. La veste sombre va au fond du sac, la capuche tombe, et l'on ressort à deux, sans courir, en parlant d'autre chose. Sur le trottoir d'en face, un passant que le groupe a bousculé tout à l'heure se tient le bras et vous suit du regard.`,
      FOULE('dispersion'), [
        voix('CAMARADE', `Marche normalement. On sort du restaurant, on rentre chez nous, voilà. Ne regarde pas en l'air.`),
        voix('PASSANT', `C'est eux ! Ils étaient avec les autres, je les reconnais !`),
      ], [`Un passant vous désigne du doigt`]),
    ph('aube', `Rentrer avant le premier métro`,
      `Le groupe n'existe plus. Du côté de la place de l'Opéra, les gyrophares tournent encore, et des agents de la propreté redressent déjà les poubelles. Vous rentrez à pied, par les petites rues ; vous ne saurez que demain combien ont dormi en garde à vue, et si le passant bousculé a porté plainte.`,
      FIN, [
        voix('CAMARADE', `On se sépare ici. Et ne viens pas la semaine prochaine, laisse passer.`),
        voix('PASSANTE', `Excusez-moi, vous savez ce qui s'est passé ? Tout est renversé jusqu'à l'Opéra.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Atteindre deux des trois cibles', 'personnalise', { target: 'cible_atteinte', count: 2 }),
    ob('o2', 'Échapper aux motos et au drone', 'ne_pas_etre_interpelle'),
    os('o3', 'Changer de tenue avant la dispersion', 'personnalise', { target: 'changement_tenue' }),
    os('o4', 'Ne pas mettre un passant en danger', 'limiter_blesses', { target: 'passant', max: 0 }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
  randomEvents: ['Un camarade est interpellé', 'Une moto surgit d\'une rue latérale', 'Un passant se plante devant le groupe', 'Un drone passe au-dessus'],
  unique: 'Le chat et la souris : la ville devient un jeu d\'évitement, de la nuit tombante à l\'aube.',
  tags: ['radical', 'cortege-sauvage', 'miroir', 'nuit'],
});

export const MF_13 = mission({
  ...base('radical'), ...scene(CDT_11), difficulty: 3, chapter: 13, mirrorOf: CDT_11.id, altRoles: ['commandant', 'secouriste'],
  id: 'manifestant-13-le-palet',
  title: 'Le palet',
  pitch: 'Renvoyer ou éloigner des palets fumants pour dégager un groupe pris dans le gaz.',
  briefing: [
    `Place de la République, à l'heure des sommations. Vous êtes avec un groupe de trente personnes au pied de la statue. Des grenades lacrymogènes tombent près de vous. Votre groupe est pris dans le nuage, avec des enfants et des personnes âgées en périphérie.`,
    `Votre mission est d'éloigner les palets fumants du groupe ou de les renvoyer vers la ligne, de dégager les personnes les plus exposées et d'éviter de vous brûler. Vous êtes radical : vous acceptez le contact, mais pas la blessure.`,
    `Approchez-vous d'un palet qui fume, ramassez-le et choisissez : l'écarter du groupe ou le renvoyer vers la ligne. Guidez d'abord les enfants et les personnes âgées vers l'air libre. Sortez vous-même du nuage dès que votre vue se brouille.`,
    `Un palet brûle : chaque seconde passée à le tenir vous blesse davantage. Le renvoi vers la ligne peut aggraver la situation et vous exposer à des poursuites. Vous en mesurerez la conséquence.`,
  ],
  intel: intel(
    'Quatre cents personnes ; nuage lacrymogène sur la place.',
    'Trente individus déterminés près de la statue.', ['Place de la République', 'Boulevard du Temple'],
    ['Mettre des gants épais', 'Éloigner plutôt que renvoyer', 'Aider les personnes exposées']),
  phases: [
    ph('nuage', `Le nuage au pied de la statue`,
      `Dix-neuf heures, place de la République. Les sommations viennent d'être prononcées, et les premières grenades lacrymogènes tombent au pied de la statue, où vous êtes une trentaine. Le nuage s'étale au ras du sol, poussé par le vent d'ouest ; en bordure du groupe, deux enfants avec leur mère et un couple âgé n'ont pas compris qu'il fallait partir.`,
      TENS(0.55), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        voix('CAMARADE', `Ça tombe sur nous ! Respire par le nez, ne te frotte pas les yeux ! Il y a des gosses, là-bas !`),
      ], [`Des grenades lacrymogènes tombent près du groupe`, `Un enfant tousse`]),
    ph('palets', `Un palet fume à vos pieds`,
      `La tension monte. Sur le pavé de la place de la République, les palets tournent sur eux-mêmes en crachant leur fumée, brûlants. Chacun peut être écarté du groupe, vers le terre-plein vide, ou renvoyé vers la ligne : ce n'est pas le même geste, et la justice ne le regarde pas de la même façon. Dans les deux cas, chaque seconde passée à le tenir se paie.`,
      T(180), [
        voix('CAMARADE', `Ne le renvoie pas sur eux ! Tu veux qu'ils chargent ? Pousse-le vers le terre-plein, loin des gens !`),
        voix('MANIFESTANT', `Renvoie-le ! Renvoie-leur, qu'ils goûtent à leur gaz !`),
      ], [`Un palet brûle les gants`, `Un journaliste filme de près`, `Retour de gaz`]),
    ph('les-plus-fragiles', `Les enfants d'abord`,
      `Le nuage couvre maintenant tout le groupe. La mère ne voit plus rien et serre ses deux enfants contre elle ; le vieux monsieur s'est assis par terre. L'air libre est à quarante mètres, contre le vent, du côté du boulevard Saint-Martin : il faut les y conduire, un par un s'il le faut, et revenir chercher les autres.`,
      OBJ('o2'), [
        voix('MÈRE', `Je ne vois plus rien ! Prenez la petite, je vous en supplie, prenez-la !`),
        voix('CAMARADE', `Par là, contre le vent ! Tiens-les par l'épaule et marche, ne cours pas, ils tombent !`),
      ], [`Une mère aveuglée appelle à l'aide`, `Un homme âgé s'assoit au milieu du nuage`]),
    ph('yeux-rouges', `Ce que le geste a changé`,
      `Cinq personnes respirent à l'air libre, à l'entrée du boulevard Saint-Martin. Place de la République, le nuage se déchire lentement ; vos mains vous lancent, vos yeux coulent. La suite dépend de ce que vous avez fait des palets : écartés, personne ne vous demandera rien ; renvoyés, une caméra vous a peut-être dans son cadre.`,
      FIN, [
        voix('MÈRE', `Merci. Merci. Je ne sais même pas comment vous vous appelez.`),
        voix('STREET MEDIC', `Montrez vos mains. Et rincez vos yeux avec ça, tête penchée, sans frotter.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éloigner au moins trois palets du groupe', 'proteger_les_siens', { target: 'palet', count: 3 }),
    ob('o2', 'Dégager les personnes exposées', 'proteger_les_siens', { target: 'personne_exposee', count: 5 }),
    os('o3', 'Ne pas se brûler les mains', 'survivre'),
    os('o4', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('joueur_hors_combat', 'Brûlure grave ou malaise.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un palet brûle les gants', 'Retour de gaz', 'Un enfant tousse', 'Un journaliste filme de près'],
  unique: 'Renvoyer ou éloigner : la mission raconte la physique des gaz, de l\'autre côté du nuage.',
  tags: ['radical', 'gaz', 'miroir'],
});

export const MF_14 = mission({
  ...base('radical'), type: 'manifestation_interdite', difficulty: 3, chapter: 13,
  id: 'manifestant-14-disparaitre',
  title: 'Disparaître',
  pitch: 'Après une action, sortir du périmètre sans être désigné par le drone.',
  briefing: [
    `Boulevard Poissonnière, une manifestation interdite se disperse. Vous venez de participer à une action collective qui a causé des dégâts. Vous êtes en tenue sombre, capuche, sac à dos. Un drone de la préfecture vole au-dessus de la zone.`,
    `Votre mission est de sortir du périmètre sans être désigné par le drone, de ne pas être interpellé, de vous changer à couvert et de rejoindre le métro. La clé est de ne pas courir : la course attire.`,
    `Marchez. Changez de veste dans un porche. Retirez la capuche. Mêlez-vous à un groupe de passants. Évitez les rues larges. Prenez le métro à une station éloignée.`,
    `Le drone voit les couleurs : changer de veste est essentiel. Ne regardez pas en l'air. Ne vous retournez pas. Si un policier vous interpelle, restez calme et demandez un avocat.`,
  ],
  place: 'Boulevard Poissonnière', timeOfDay: 18, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.45, 0.55, 0.15, { gilets_jaunes: 0.25, black_bloc: 0.15, militants: 0.2, curieux: 0.4 },
    ['Boulevard Poissonnière', 'Boulevard de Bonne Nouvelle', 'Rue du Faubourg Poissonnière'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, drone: true, bravm: 2, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes en dispersion ; un drone survole la zone.',
    'Une soixantaine d\'individus ont participé à l\'action.', ['Boulevard Poissonnière', 'Boulevard de Bonne Nouvelle'],
    ['Marcher sans courir', 'Changer de veste à couvert', 'Prendre le métro loin']),
  phases: [
    ph('marcher', `Marcher, ne pas courir`,
      `Dix-huit heures, boulevard Poissonnière. Derrière vous, des vitrines à terre et des sirènes ; devant, des passants qui rentrent du travail. Vous êtes en sombre, capuche, sac à dos, et un drone de la préfecture tient la zone. Celui qui court se désigne lui-même : il faut marcher, au pas des autres, sans lever la tête.`,
      T(100), [
        voix('CAMARADE', `On se sépare. Ne cours pas, ne te retourne pas. Si on te parle, tu sors du bureau.`),
        voix('PASSANT', `Qu'est-ce qui se passe, là-bas ? Ça sent le brûlé jusqu'ici.`),
      ], [`Un drone passe au-dessus du boulevard`]),
    ph('porche', `Un porche, rue Rougemont`,
      `Rue Rougemont, une porte cochère est restée entrouverte. Le drone voit les couleurs : la veste noire va dans le sac, la capuche disparaît, et il ne reste qu'un pull gris comme en portent dix mille personnes ce soir. Dans la cour, une gardienne sort ses poubelles et vous regarde faire sans rien dire.`,
      T(150), [
        voix('GARDIENNE', `Vous cherchez quelqu'un ? La porte, c'est pour les résidents.`),
        voix('CAMARADE', `Tu es où ? Ils contrôlent au carrefour, ne passe pas par le boulevard.`),
      ], [`Une gardienne vous surprend dans la cour`, `Le drone revient au-dessus de la rue`]),
    ph('patrouille', `Les motos au carrefour`,
      `Vous ressortez sur le boulevard Poissonnière au milieu d'employés qui quittent un bureau. Au carrefour de la rue du Faubourg Montmartre, quatre motos de la BRAV-M sont arrêtées, moteur tournant ; les passagers dévisagent les passants un par un. Un gardien de la paix arrête un jeune homme en noir, trois mètres devant vous.`,
      T(120), [
        voix('POLICIER', `Bonsoir. Vous venez d'où, là ? Ouvrez votre sac, s'il vous plaît.`),
        voix('PASSANTE', `Encore un contrôle. Avec tout ce qu'ils ont cassé, en même temps…`),
      ], [`Une patrouille de la BRAV-M apparaît`, `Un policier demande vos papiers`]),
    ph('station', `La bouche du métro`,
      `La station Grands Boulevards est de l'autre côté du carrefour, à quatre-vingts mètres. Entre elle et vous, le contrôle, la lumière des vitrines et le drone. On peut traverser avec le flot des passants, au feu, comme tout le monde, ou faire le tour par la rue Bergère, plus sombre, où un homme seul se remarque davantage.`,
      OBJ('o2'), [
        voix('CAMARADE', `Ils fouillent les sacs devant le métro. Fais attention à ce que tu as dans le tien.`),
        voix('POLICIER', `Circulez, s'il vous plaît, ne restez pas sur le carrefour.`),
      ], [`Un contrôle des sacs se tient devant la bouche du métro`]),
    ph('grille-baissee', `La grille baissée`,
      `Vous y êtes, et la grille est baissée : « Station fermée sur ordre de la préfecture de police ». Autour de la bouche des Grands Boulevards, vingt personnes lisent l'affiche en soupirant. La station suivante est à six cents mètres, par le boulevard Montmartre ; il faut repartir, au même pas, avec les mêmes gens.`,
      T(150), [
        voix('AGENT DE STATION', `C'est fermé, messieurs-dames ! Sur ordre de la préfecture. La station suivante est ouverte, c'est à dix minutes à pied.`),
        voix('PASSANT', `Tous les samedis, c'est pareil. Vous allez vers Opéra ? On fait le chemin ensemble, si vous voulez.`),
      ], [`La station est fermée sur ordre de la préfecture`]),
    ph('rame', `Une rame parmi d'autres`,
      `Sur le quai, une rame arrive, bondée, tiède. Vous tenez la barre entre un livreur et une étudiante, votre sac entre les pieds, pendant que le boulevard Montmartre s'éloigne au-dessus de vos têtes. Personne ne vous regarde ; vous ne saurez que dans quelques jours, ou quelques mois, si les images du drone ont suffi.`,
      FIN, [
        voix('ANNONCE SONORE', `En raison d'une manifestation, plusieurs stations du secteur sont fermées au public. Veuillez nous excuser pour la gêne occasionnée.`),
        voix('CAMARADE', `Tu es passé ? Deux des nôtres ne répondent plus. Je crois qu'ils les ont.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Sortir du périmètre sans être désigné par le drone', 'ne_pas_etre_interpelle', { target: 'drone' }),
    ob('o2', 'Atteindre la station de métro', 'atteindre', { place: 'Grands Boulevards' }),
    os('o3', 'Se changer à couvert', 'personnalise', { target: 'changement_tenue' }),
    os('o4', 'Ne jamais courir', 'personnalise', { target: 'course', max: 0 }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('personnalise', 'Désigné par le drone.')],
  randomEvents: ['Un drone passe au-dessus', 'Une patrouille de la BRAV-M apparaît', 'Un policier demande vos papiers', 'La station est fermée'],
  unique: 'La disparition : la ville est un labyrinthe dans lequel la seule règle est d\'avoir l\'air ordinaire.',
  tags: ['radical', 'fuite'],
});

export const MF_15 = mission({
  ...base('radical'), type: 'emeute_nocturne', difficulty: 4, chapter: 13,
  id: 'manifestant-15-ligne-rouge',
  title: 'Ligne rouge',
  pitch: 'Votre groupe veut s\'en prendre aux pompiers : refuser, s\'interposer ou partir.',
  briefing: [
    `Rue Saint-Antoine, la nuit. Votre groupe a allumé plusieurs feux. Un fourgon de sapeurs-pompiers de Paris arrive pour éteindre. Quelques individus, hors de contrôle, veulent s'en prendre à lui : lancer des projectiles et bloquer la lance.`,
    `Votre mission est de choisir : refuser, vous interposer ou partir. Une ligne rouge est franchie si les secours sont agressés. Vous êtes radical, mais pas prêt à tout.`,
    `Parlez au chef : « Pas les pompiers. » Placez-vous entre le fourgon et les individus. Faites reculer. Si le groupe insiste, partez. Aidez les pompiers à passer s'ils le demandent.`,
    `Les pompiers n'ont pas d'armes : ce sont des secours. S'en prendre à eux est impardonnable : l'image du groupe et la vôtre en dépendent. Les conséquences judiciaires sont lourdes.`,
  ],
  place: 'Rue Saint-Antoine', timeOfDay: 23, weather: 'clair', windFrom: 240, windSpeed: 2,
  crowd: crowd(250, '', 0.65, 0.8, 0.4, { black_bloc: 0.4, fetards: 0.3, curieux: 0.3 },
    ['Rue Saint-Antoine', 'Place de la Bastille'], 0.1),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 2, samu: 1 }),
  intel: intel(
    'Deux cent cinquante personnes ; plusieurs feux allumés.',
    'Une centaine d\'individus encagoulés.', ['Rue Saint-Antoine', 'Place de la Bastille'],
    ['Protéger les pompiers', 'S\'interposer ou partir', 'Convaincre le chef']),
  phases: [
    ph('trois-feux', `Trois feux et une sirène`,
      `Vingt-trois heures, rue Saint-Antoine. Votre groupe a allumé trois feux de poubelles entre la rue Saint-Paul et la rue de Birague, et la fumée rampe le long des façades. Une sirène à deux tons approche depuis la place de la Bastille : ce n'est pas la police, c'est un fourgon rouge des sapeurs-pompiers de Paris.`,
      T(90), [
        voix('CHEF', `Les pompiers ! Ils viennent pour nos feux. On ne les laisse pas passer !`),
        voix('CAMARADE', `C'est des pompiers, pas des policiers. Il y a des gens qui habitent au-dessus, je te signale.`),
      ], [`Un fourgon de sapeurs-pompiers s'engage dans la rue`]),
    ph('premiere-bouteille', `La première bouteille`,
      `Le fourgon s'est arrêté à trente mètres, rue Saint-Antoine, et quatre pompiers en descendent, sans bouclier, sans arme, une lance sur l'épaule. Une bouteille part du groupe et éclate contre la carrosserie. Cinq ou six individus avancent, d'autres hésitent ; le chef regarde qui suit.`,
      T(120), [
        voix('SAPEUR-POMPIER', `On vient pour le feu, c'est tout ! Il y a des habitants là-haut ! Laissez-nous travailler !`),
        voix('CHEF', `Qu'est-ce que tu regardes ? Tu es avec nous ou tu es avec eux ?`),
      ], [`Un individu lance une bouteille vers le fourgon`, `Le chef vous insulte`]),
    ph('ligne-rouge', `« Pas les pompiers »`,
      `C'est maintenant. Dire au chef, devant tout le monde, « pas les pompiers » ; se placer entre le fourgon et ceux qui avancent, les mains ouvertes ; ou tourner les talons vers la rue Saint-Paul et ne plus en être. Aucune de ces trois réponses n'est sans prix, et ne rien choisir en est une quatrième.`,
      OBJ('o2'), [
        voix('CAMARADE', `Si tu y vas, j'y vais avec toi. Mais décide-toi, ils vont leur tomber dessus !`),
        voix('SAPEUR-POMPIER', `Reculez ! On a un collègue touché à l'épaule ! Reculez, bon sang !`),
      ], [`Un pompier est touché par un projectile`]),
    ph('lance', `La lance en batterie`,
      `Votre choix est fait, et le groupe s'est fendu en deux. Rue Saint-Antoine, les pompiers déroulent leurs tuyaux sous les invectives des uns et le regard des autres ; aux fenêtres, des habitants applaudissent ou filment. Au bout de la rue, côté place de la Bastille, des gyrophares bleus arrivent à leur tour.`,
      FOULE('dispersion'), [
        voix('CHEF', `Toi, je te retiens. Ne remets plus les pieds avec nous.`),
        voix('RIVERAIN', `Laissez-les passer ! C'est sous nos fenêtres que ça brûle, pas sous les vôtres !`),
      ], [`Un policier approche`, `Des habitants descendent dans la rue`]),
    ph('suites', `Ce qui reste d'une nuit`,
      `La rue Saint-Antoine se vide par les deux bouts. Il reste de l'eau noire dans le caniveau, des poubelles fondues, et un pompier assis sur le marchepied du fourgon, qui se tient l'épaule. S'en prendre aux secours est puni bien plus lourdement que le reste ; ce soir, certains l'ont découvert, et d'autres ont dit non.`,
      FIN, [
        voix('SAPEUR-POMPIER', `On vient pour des poubelles et on repart avec un blessé. Dites-le à vos amis : nous, on ne fait que les secours.`),
        voix('CAMARADE', `On rentre. J'ai honte, pour la bouteille. Pas toi ?`),
      ]),
  ],
  objectives: [
    ob('o1', 'Empêcher toute agression contre les pompiers', 'proteger_les_siens', { target: 'pompiers' }),
    ob('o2', 'Choisir : refuser, s\'interposer ou partir', 'personnalise', { target: 'choix_ligne_rouge' }),
    os('o3', 'Convaincre le chef du groupe', 'personnalise', { target: 'persuasion' }),
    os('o4', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
  ],
  failures: [fail('personnalise', 'Secours agressés.'), fail('interpelle', 'Interpellé : suites judiciaires.')],
  randomEvents: ['Un individu lance une bouteille vers le fourgon', 'Le chef vous insulte', 'Un pompier est touché', 'Un policier approche'],
  unique: 'La ligne rouge : on découvre que la violence a des limites, et que c\'est à chacun de les fixer.',
  tags: ['radical', 'ligne-rouge', 'nuit'],
});

export const MF_16 = mission({
  ...base('radical'), type: 'emeute_nocturne', difficulty: 3, chapter: 13,
  id: 'manifestant-16-le-prix',
  title: 'Le prix',
  pitch: 'Jouer une séquence d\'affrontement, puis découvrir l\'écran des suites judiciaires : toutes les fins sont montrées.',
  briefing: [
    `Place du Châtelet, en fin d'après-midi. Vous participez à un affrontement avec des CRS : jets de projectiles, repli, retour. Vous êtes un manifestant radical. Cette mission est pédagogique : elle vous fait jouer l'affrontement puis découvrir ses suites, quelle que soit votre fin.`,
    `Votre mission est de jouer la séquence : participer à l'affrontement, vous replier ou être interpellé. Quoi que vous fassiez, un écran vous montre ensuite les suites : garde à vue, jugement, casier, conséquences pour les proches.`,
    `Avancez avec le groupe. Restez en retrait ou allez au contact : c'est vous qui décidez jusqu'où vous suivez. Repliez-vous à l'ordre. Si vous êtes interpellé, vous êtes mis en garde à vue. Lisez ensuite l'écran des suites.`,
    `Tous les chemins mènent à un écran de conséquences : amende, condamnation, mention au casier, perte d'emploi. C'est le prix. La mission ne juge pas : elle montre.`,
  ],
  place: 'Place du Châtelet', timeOfDay: 18, weather: 'nuageux', windFrom: 260, windSpeed: 3,
  crowd: crowd(400, 'libertes', 0.6, 0.7, 0.3, { black_bloc: 0.3, gilets_jaunes: 0.25, militants: 0.2, curieux: 0.25 },
    ['Place du Châtelet', 'Boulevard de Sébastopol'], 0.4),
  forces: forces({ sections: 3, fourgons: 9, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; un affrontement prévisible.',
    'Cent vingt individus déterminés.', ['Place du Châtelet', 'Boulevard de Sébastopol'],
    ['Suivre le groupe', 'Se replier à l\'ordre', 'Lire l\'écran des suites']),
  phases: [
    ph('sous-les-arbres', `Le groupe se forme sous les arbres`,
      `Dix-huit heures, place du Châtelet. Une centaine de personnes en sombre se regroupent sous les arbres, face à trois sections de CRS déployées devant le boulevard de Sébastopol. On se passe des masques, on ramasse ce qui traîne. Cette fois, vous n'êtes pas venu regarder : vous irez aussi loin que vous le déciderez, et vous verrez ensuite ce que cela coûte.`,
      TENS(0.7), [
        voix('CHEF', `On avance ensemble, on recule ensemble. Quand je dis repli, c'est repli, personne ne fait le héros.`),
        voix('COMMANDANT', SOMMATIONS.annonce),
      ], [`Un drone passe au-dessus de la place`]),
    ph('affrontement', `Cinq minutes d'affrontement`,
      `La tension monte d'un coup : les premiers projectiles partent vers les boucliers, les grenades répondent, et la place du Châtelet disparaît dans la fumée. Le groupe avance, recule, revient. Rester en retrait ou aller au contact, ramasser un pavé ou garder les mains vides : personne ne décide à votre place, et tout est filmé.`,
      OBJ('o1'), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        voix('CHEF', `En avant ! Avec moi ! Ceux qui ont peur restent derrière !`),
      ], [`Un camarade tombe à terre`, `Retour de gaz`, `Un journaliste filme de près`]),
    ph('repli', `Le repli vers le quai`,
      `Cinq minutes ont passé, et la ligne s'ébranle. Le chef crie le repli ; le groupe reflue vers le quai de Gesvres, en désordre, laissant derrière lui ceux qui sont tombés. Des policiers en civil surgissent sur les côtés et saisissent ceux qui traînent. Courir, se rendre, aider celui qui boite : c'est le dernier choix de la soirée.`,
      T(150), [
        voix('CHEF', `Repli ! Repli ! On dégage par le quai, on ne s'occupe de personne !`),
        voix('POLICIER', `Police ! À terre ! Les mains dans le dos, ne bougez plus !`),
      ], [`Des policiers en civil interpellent sur les flancs`, `Un camarade boite et demande de l'aide`]),
    ph('ecran-des-suites', `L'écran des suites`,
      `Que vous ayez couru ou que vous ayez été pris, la soirée ne s'arrête pas place du Châtelet. L'écran qui s'ouvre déroule ce qui peut suivre, dans l'ordre : la garde à vue, l'avocat de permanence, la comparution, puis l'amende, la peine, la mention au casier, et ce qu'en dit un employeur. Rien n'est jugé ici ; tout est montré.`,
      OBJ('o2'), [
        voix('AVOCATE', `Je suis de permanence ce soir. À ceux que je vois en garde à vue, je dis toujours la même chose : dites-moi ce que vous avez fait, pas ce que vous avez vu faire.`),
        voix('CAMARADE', `Ils en ont pris plusieurs. Moi, je suis rentré, mais ils ont les images du drone. Je ne dors plus.`),
      ], [`Les images du drone sont versées aux dossiers`]),
    ph('prix', `Ce que coûte une soirée`,
      `Place du Châtelet, les balayeuses passent déjà. Quelle que soit votre fin, le compte est le même pour ceux qui étaient là : des yeux brûlés, des vitrines, des nuits en cellule, et pour quelques-uns un casier qui les suivra longtemps. La colère qui vous a amené n'a pas disparu ; elle a seulement, maintenant, un prix que vous connaissez.`,
      FIN, [
        voix('AVOCATE', `On me demande toujours si ça valait le coup. Je n'ai pas de réponse. Je sais seulement ce que ça coûte.`),
        voix('CAMARADE', `Tu reviendras, toi ? Moi, je ne sais plus.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Participer à la séquence d\'affrontement jusqu\'au repli', 'personnalise', { target: 'presence_dans_le_groupe', seconds: 300 }),
    ob('o2', 'Lire l\'écran des suites judiciaires', 'personnalise', { target: 'ecran_suites' }),
    os('o3', 'Ne pas blesser un tiers', 'limiter_blesses', { target: 'tiers', max: 0 }),
    os('o4', 'Se replier à l\'ordre', 'personnalise', { target: 'repli_a_l_ordre', count: 1 }),
  ],
  failures: [fail('temps', 'Séquence abandonnée avant la fin : l\'écran des suites est montré quand même.', 900)],
  randomEvents: ['Un camarade tombe à terre', 'Un drone passe au-dessus', 'Retour de gaz', 'Un journaliste filme de près'],
  unique: 'La seule mission où il n\'y a pas d\'échec : toutes les fins mènent à l\'écran des conséquences.',
  tags: ['radical', 'pedagogique', 'suites-judiciaires'],
});

export const MF_17 = mission({
  ...base('opportuniste'), type: 'manifestation_declaree', difficulty: 4, chapter: 13,
  id: 'manifestant-17-demi-tour',
  title: 'Demi-tour',
  pitch: 'Dans un cortège qui bascule, vous pouvez suivre les autres ou faire demi-tour : le moment où l\'on choisit.',
  briefing: [
    `Boulevard Saint-Martin, un cortège déclaré se disloque. Vous êtes opportuniste : venu par curiosité, vous suivez un groupe qui s'enhardit. Des vitrines brisées, des cris, des projectiles. Le moment de la bascule est là.`,
    `Votre mission est de choisir : suivre le groupe ou faire demi-tour. Vous pouvez rester spectateur, participer ou vous éloigner. Chaque choix a ses conséquences et ses scènes.`,
    `Regardez autour de vous. Écoutez ce que vous ressentez. Décidez en trente secondes. Si vous suivez, vous participez à une dégradation. Si vous faites demi-tour, rejoignez la sortie. Si vous restez, vous risquez d'être pris dans une nasse.`,
    `Un demi-tour n'est pas une lâcheté : c'est une décision. Une fois au contact, difficile de revenir. Le jeu ne vous jugera pas, il vous montrera.`,
  ],
  place: 'Boulevard Saint-Martin', timeOfDay: 17, weather: 'couvert', windFrom: 260, windSpeed: 3,
  crowd: crowd(600, 'libertes', 0.5, 0.65, 0.12, { gilets_jaunes: 0.25, black_bloc: 0.12, syndical: 0.2, curieux: 0.43 },
    ['Boulevard Saint-Martin', 'Place de la République'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six cents personnes ; un cortège qui se disloque.',
    'Une soixantaine d\'individus déterminés.', ['Boulevard Saint-Martin', 'Place de la République'],
    ['Choisir en trente secondes', 'Repérer la sortie', 'Éviter la nasse']),
  phases: [
    ph('venu-pour-voir', `Venu pour voir`,
      `Dix-sept heures, boulevard Saint-Martin. Vous n'êtes d'aucune organisation : vous passiez, un ami vous a dit « viens voir », et vous suivez depuis vingt minutes un cortège qui se défait. Devant, un groupe s'enhardit, renverse une barrière, puis une autre ; on rit, on filme, et vous riez un peu aussi.`,
      T(120), [
        voix('AMI', `Viens, on les suit ! Il ne se passe jamais rien, d'habitude. Pour une fois qu'on est aux premières loges !`),
        voix('MANIFESTANTE', `Ne restez pas là, les jeunes. Ça va mal finir, je les connais. Rentrez chez vous.`),
      ], [`Un ami veut suivre le groupe`]),
    ph('vitrine', `La vitrine d'en face`,
      `Une vitrine éclate à dix mètres, sur le boulevard Saint-Martin, et le bruit n'a rien à voir avec celui des vidéos. Quelqu'un vous tend un morceau de pavé, comme on tend une cigarette. Votre ami a déjà les yeux qui brillent ; autour, les visages se couvrent, et vous êtes le seul à visage nu.`,
      TENS(0.62), [
        voix('INCONNU', `Tiens, prends. Tout le monde en a un. Tu ne vas pas rester là à regarder ?`),
        voix('AMI', `Allez ! Juste une, pour dire qu'on l'a fait. Personne ne nous connaît, ici.`),
      ], [`Une vitrine est brisée devant vous`, `Un inconnu vous tend un projectile`]),
    ph('trente-secondes', `Trente secondes pour décider`,
      `La tension monte. Au bout du boulevard, du côté de la place de la République, des casques se mettent en ligne ; dans une demi-minute, les rues latérales seront fermées. Suivre, et vous en êtes. Rester à regarder, et vous serez pris dans la nasse avec les autres. Faire demi-tour par la rue René Boulanger, et vous laissez votre ami.`,
      OBJ('o1'), [
        voix('AMI', `Qu'est-ce que tu fais ? Tu ne vas pas te dégonfler maintenant ! Reste, au moins !`),
        voix('COMMANDANT', SOMMATIONS.annonce),
      ], [`Les CRS arrivent`]),
    ph('boucliers', `Les boucliers au bout du boulevard`,
      `Vous avez décidé. Les CRS avancent sur le boulevard Saint-Martin, une grenade roule sur la chaussée, et la foule se déchire vers les rues latérales. Où que vous soyez maintenant, dans le groupe, sur le trottoir ou déjà rue René Boulanger, votre ami n'est plus à côté de vous.`,
      FOULE('dispersion'), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        voix('AMI', `Tu es où ? Je ne te vois plus ! Ils ferment tout, je ne sais pas par où sortir !`),
      ], [`Une grenade tombe près de vous`, `Votre ami est emporté par le mouvement de foule`]),
    ph('mesure', `Ce que pèse une demi-minute`,
      `Le boulevard Saint-Martin est jonché de verre, et les fourgons remontent la chaussée au pas. Selon ce que vous avez choisi, vous regardez cela de loin, les mains vides, ou de très près, avec autre chose dans les mains. Personne ne vous jugera ici ; on vous montrera seulement ce qu'une demi-minute a changé, pour vous et pour votre ami.`,
      FIN, [
        voix('AMI', `Je suis sorti. Je crois. J'ai les mains qui tremblent. Tu avais raison, ou tort, je ne sais plus.`),
        voix('PASSANT', `Vous étiez dedans ? Vous avez de la chance d'être debout. Regardez l'état du boulevard.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Prendre une décision avant l\'arrivée des CRS', 'personnalise', { target: 'decision', seconds: 30 }),
    ob('o2', 'Ne pas être interpellé', 'ne_pas_etre_interpelle'),
    os('o3', 'Rejoindre la sortie par la rue latérale', 'atteindre', { place: 'Boulevard Saint-Martin' }),
    os('o4', 'Retrouver son ami', 'proteger_les_siens', { target: 'ami' }),
  ],
  failures: [fail('interpelle', 'Interpellé : suites judiciaires.'), fail('joueur_hors_combat', 'Vous êtes blessé et devez quitter les lieux.')],
  randomEvents: ['Une vitrine est brisée devant vous', 'Un ami veut suivre le groupe', 'Les CRS arrivent', 'Une grenade tombe près de vous'],
  unique: 'Le moment du choix : l\'opportuniste découvre que rester ou partir est la vraie mission.',
  tags: ['opportuniste', 'bascule'],
});
