/* =====================================================================================
 * Catalogue — médecin bénévole (« street medic ») : soigner dans la rue, trier, se faire reconnaître
 * des deux côtés. Rôle civil : il ouvre une mission quand sa mission miroir est terminée.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, FOULE, intel, mission, ob, os, ph, scene, T, TENS } from './dsl';
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
  forces: forces({ sections: 1, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; salve de lacrymogènes sur le boulevard Voltaire.',
    'Une trentaine d\'individus déterminés.', ['Place de la République', 'Boulevard Voltaire'],
    ['Approcher par le côté du vent', 'Ne pas s\'exposer plus de vingt secondes', 'Orienter vers l\'air frais']),
  phases: [
    ph('equipement', 'Équipement', 'Vous vérifiez votre sac et votre masque.', T(30),
      [['LIAISON', 'MÉDECIN ICI LIAISON. Salve en cours, rue Voltaire. Vous avez trois minutes. PARLEZ.']], []),
    ph('rincage', 'Rinçage', 'Vous rincez les yeux des premières victimes.', T(120),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. DIX personnes traitées. PARLEZ.']], ['Un manifestant vous demande de le soigner le premier']),
    ph('bilan', 'Bilan', 'Vous rendez compte du nombre de personnes traitées.', FIN,
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. QUINZE personnes traitées, aucun cas grave. PARLEZ.']], []),
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
    `Votre mission est de trier les blessés selon l'urgence, de traiter d'abord les cas rouges, puis les jaunes, puis les verts, et de transmettre un bilan juste par radio aux secours. Vous êtes seul pour l'instant : la décision est à vous.`,
    `Évaluez d'abord : respiration, saignement, conscience. Inconsciente qui respire : position latérale de sécurité. Saignement : compression directe. Intoxiqués : rinçage et air frais. Transmettez le bilan : nature, volume, attitude. Évitez le nuage.`,
    `Un rouge traité en dernier est une faute lourde. Ne vous éloignez pas de votre sac. Les gaz irritent les yeux : portez vos lunettes. Ne déplacez jamais un blessé du dos sans nécessité.`,
  ],
  intel: intel(
    'Neuf cents personnes ; nuage lacrymogène revenant sur le trottoir.',
    'Une trentaine d\'individus déterminés.', ['Boulevard Beaumarchais', 'Rue Amelot'],
    ['Trier avant de soigner', 'Éviter le nuage', 'Transmettre un bilan juste']),
  phases: [
    ph('evaluation', 'Évaluation', 'Vous évaluez les six blessés.', T(120),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. SIX blessés, une inconsciente, un saignement de tête. PARLEZ.']], []),
    ph('traitement', 'Traitement des urgences', 'Vous traitez les rouges en premier.', T(300),
      [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Équipe en route, QUATRE minutes. PARLEZ.']], ['Le nuage revient sur le trottoir']),
    ph('evacuation', 'Évacuation', 'Les secours emportent les cas rouges.', TENS(0.5),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. DEUX rouges évacués, QUATRE verts traités. PARLEZ.']], []),
    ph('fin', 'Bilan', 'Vous transmettez le bilan final.', FIN, [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. Bilan : SIX traités. TERMINÉ.']], []),
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
  forces: forces({ sections: 2, fourgons: 4, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents personnes ; un blessé inconscient entre les lignes.',
    'Une soixantaine d\'individus déterminés.', ['Rue Saint-Honoré', 'Rue Royale'],
    ['S\'identifier à voix haute', 'Joindre l\'officier', 'Prévoir deux porteurs']),
  phases: [
    ph('approche', 'Approche de la ligne', 'Vous approchez la ligne mains levées.', T(120),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. Médecin, urgence vitale entre les lignes. Demande un couloir. PARLEZ.']], []),
    ph('couloir', 'Couloir', 'L\'officier obtient un couloir de trois mètres cinquante.', T(240),
      [['MISTRAL 1', 'MISTRAL UN ICI MISTRAL TROIS. Couloir pour SANTÉ UN, axe véhicules, largeur TROIS mètres CINQ-ZÉRO. TERMINÉ.']], ['Un projectile tombe à dix mètres']),
    ph('extraction', 'Extraction', 'Vous portez la victime hors de la zone.', TENS(0.5),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. Victime extraite, conscience altérée. PARLEZ.']], []),
    ph('fin', 'Évacuation', 'Le SAMU prend en charge la victime.', FIN, [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Victime prise en charge. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Obtenir un couloir de trois mètres cinquante', 'proteger_les_siens', { target: 'couloir_secours' }),
    ob('o2', 'Extraire la victime en moins de quatre minutes', 'secourir', { target: 'urgence_absolue', count: 1, seconds: 240 }),
    os('o3', 'Ne jamais traverser la ligne sans autorisation', 'zero_bavure'),
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
    `Entrez, balisez : croix rouge, lumière. Allongez les blessés, prenez les constantes, rassurez. Demandez à un habitant de tenir la porte. Appelez le SAMU par radio. Faites sortir les non-blessés. Fermez la porte lors de tirs de gaz.`,
    `Un hall n'est pas un hôpital : ne gardez que ce que vous pouvez soigner. Les forces de l'ordre doivent savoir où est le poste, pour ne pas le gazer. Prévenez la liaison.`,
  ],
  intel: intel(
    'Cent quatre-vingts personnes retenues dans l\'îlot ; un hall disponible.',
    'Soixante individus déterminés dans l\'îlot.', ['Rue de Turbigo', 'Rue Saint-Denis', 'Rue Rambuteau'],
    ['Baliser le poste', 'Prévenir la liaison', 'Fermer la porte lors des tirs de gaz']),
  phases: [
    ph('ouverture', 'Ouverture du poste', 'Vous balisez le hall.', T(120),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. Poste de soins ouvert dans le hall, rue de Turbigo. PARLEZ.']], []),
    ph('accueil', 'Accueil des blessés', 'Vous accueillez quatre blessés.', T(300),
      [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Nous arrivons, ouvrez la porte. PARLEZ.']], ['Un manifestant en crise d\'angoisse']),
    ph('gaz', 'Tir de gaz', 'Des grenades tombent près du hall.', TENS(0.55),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. Poste à proximité de la zone de tir. Merci de suspendre. PARLEZ.']], []),
    ph('fin', 'Évacuation', 'Les blessés sont évacués.', FIN, [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Blessés pris en charge. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Ouvrir un poste de soins dans le hall', 'soigner', { place: 'Rue de Turbigo', target: 'poste_soins' }),
    ob('o2', 'Accueillir quatre blessés', 'secourir', { count: 4 }),
    os('o3', 'Éviter que le poste soit gazé avec des blessés dedans', 'proteger_les_siens', { target: 'poste_soins' }),
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
  forces: forces({ sections: 3, fourgons: 6, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Six cents personnes ; deux blessés à cinquante mètres l\'un de l\'autre.',
    'Une centaine d\'individus déterminés.', ['Place de la Concorde', 'Rue Royale'],
    ['Annoncer la neutralité', 'Soigner le plus grave en premier', 'Demander de l\'aide à chaque camp']),
  phases: [
    ph('blesses', 'Deux blessés', 'Un policier brûlé, un manifestant blessé à la tête.', T(120),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. DEUX blessés graves, deux camps. Je soigne les deux. PARLEZ.']], []),
    ph('soins', 'Soins', 'Vous soignez le plus grave puis l\'autre.', T(300),
      [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Deux équipes en route, deux couloirs. PARLEZ.']], ['Un manifestant hurle que vous soignez un policier']),
    ph('couloirs', 'Couloirs', 'Les secours prennent les deux victimes.', TENS(0.55),
      [['MISTRAL 1', 'MÉDECIN ICI MISTRAL UN. Couloir ouvert pour le policier. PARLEZ.']], []),
    ph('fin', 'Bilan', 'Les deux victimes sont évacuées.', FIN, [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. Deux victimes évacuées. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Soigner les deux blessés avant l\'arrivée des secours', 'soigner', { target: 'blesse_grave', count: 2 }),
    ob('o2', 'Obtenir l\'évacuation des deux victimes en moins de quatre minutes', 'secourir', { count: 2, seconds: 240 }),
    os('o3', 'Se faire reconnaître par les deux camps', 'personnalise', { target: 'neutralite' }),
    os('o4', 'Ne refuser aucun soin', 'zero_bavure'),
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
    `Votre mission est de passer le contrôle sans perdre votre matériel, d'expliquer à l'agent à quoi il sert et de garder tout ce qui vous permettra de soigner. Le matériel de soin est licite : mais il peut être confondu avec du matériel de protection.`,
    `Montrez votre brassard. Expliquez : « Médecin bénévole, voici le sérum, les compresses, les gants. » Ne vous énervez pas. Demandez l'officier si l'agent hésite. Si l'on vous retire un objet, demandez un reçu.`,
    `Le masque et les lunettes sont ambigus : un agent peut les confisquer. Défendez-les avec calme. Vous ne devez jamais vous opposer physiquement. Un reçu vaut plus qu'une dispute.`,
  ],
  place: 'Boulevard Voltaire', timeOfDay: 14, weather: 'clair', windFrom: 270, windSpeed: 2,
  crowd: crowd(800, 'pouvoir_achat', 0.25, 0.35, 0.03, { syndical: 0.4, familles: 0.2, etudiants: 0.2, curieux: 0.2 },
    ['Boulevard Voltaire', 'Place de la République'], 0.4),
  forces: forces({ sections: 1, fourgons: 2, pompiers: 0, samu: 0 }),
  intel: intel(
    'Huit cents personnes ; fouilles par sondage à l\'entrée.',
    'Aucun signalement.', ['Boulevard Voltaire'],
    ['Montrer le brassard', 'Expliquer le matériel', 'Demander un reçu']),
  phases: [
    ph('file', 'File d\'attente', 'Vous attendez dans la file de contrôle.', T(90),
      [['LIAISON', 'MÉDECIN ICI LIAISON. Fouille par sondage à l\'entrée. PARLEZ.']], []),
    ph('controle', 'Contrôle', 'Un agent fouille votre sac.', T(240),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. Contrôle en cours, je présente mon matériel. PARLEZ.']], ['L\'agent veut confisquer les lunettes']),
    ph('decision', 'Décision', 'L\'agent décide ce que vous gardez.', FOULE('dispersion'),
      [['MÉDECIN', 'LIAISON ICI MÉDECIN. Contrôle terminé, matériel conservé. PARLEZ.']], []),
    ph('fin', 'Entrée dans le cortège', 'Vous entrez dans le cortège.', FIN, [['MÉDECIN', 'LIAISON ICI MÉDECIN. Entrée effectuée. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Passer le contrôle en conservant le matériel de soin', 'ne_pas_etre_interpelle', { target: 'sac_soins' }),
    ob('o2', 'Expliquer le matériel de façon claire', 'personnalise', { target: 'explication' }),
    os('o3', 'Garder les lunettes et le masque', 'proteger_les_siens', { target: 'protections' }),
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
  forces: forces({ sections: 2, fourgons: 4, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Cinq cents personnes ; un blessé entre les lignes.',
    'Une centaine d\'individus déterminés.', ['Boulevard Henri IV', 'Place de la Bastille'],
    ['S\'identifier aux deux camps', 'Avancer au pas', 'Soigner l\'hémorragie d\'abord']),
  phases: [
    ph('annonce', 'Annonce', 'Vous vous annoncez aux deux camps.', T(60),
      [['MÉDECIN', 'MISTRAL UN ICI MÉDECIN. Médecin, j\'avance chercher un blessé. Suspension SVP. PARLEZ.']], []),
    ph('avance', 'Avancée', 'Vous avancez au pas entre les lignes.', T(180),
      [['MISTRAL 1', 'MÉDECIN ICI MISTRAL UN. Nous suspendons. PARLEZ.']], ['Un jet isolé tombe près de vous']),
    ph('soin', 'Soin et portage', 'Vous soignez et portez.', TENS(0.6),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. Blessé extrait, hémorragie contrôlée. PARLEZ.']], []),
    ph('fin', 'Évacuation', 'Le blessé est pris par le SAMU.', FIN, [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Blessé pris en charge. PARLEZ.']], []),
  ],
  objectives: [
    ob('o1', 'Récupérer le blessé entre les lignes en moins de quatre-vingt-dix secondes', 'secourir', { target: 'blesse', count: 1, seconds: 90 }),
    ob('o2', 'Se faire reconnaître des deux camps', 'personnalise', { target: 'neutralite' }),
    os('o3', 'Contrôler l\'hémorragie sur place', 'soigner', { target: 'hemorragie' }),
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
    `Votre mission est de choisir l'ordre des soins, de traiter les rouges d'abord et de transmettre six bilans justes à la radio. Le tri est votre seule arme : il détermine qui vit.`,
    `Évaluez rapidement : respiration, hémorragie, conscience. Rouge : hémorragie et traumatisme crânien. Jaune : brûlure. Vert : intoxiqués. Traitez, transmettez. Votre binôme prend la brûlure. Demandez des renforts.`,
    `Un rouge traité en dernier est une faute lourde. Ne passez pas trop de temps sur un cas désespéré. Gardez un œil sur les verts.`,
  ],
  place: 'Rue de Rivoli', timeOfDay: 18, weather: 'couvert', windFrom: 250, windSpeed: 3,
  crowd: crowd(300, 'libertes', 0.55, 0.65, 0.2, { black_bloc: 0.25, gilets_jaunes: 0.25, curieux: 0.5 },
    ['Rue de Rivoli', 'Rue de Castiglione'], 0.2),
  forces: forces({ sections: 1, fourgons: 2, pompiers: 1, samu: 1 }),
  intel: intel(
    'Trois cents personnes ; six blessés à terre.',
    'Une soixantaine d\'individus déterminés.', ['Rue de Rivoli'],
    ['Évaluer avant de soigner', 'Traiter les rouges d\'abord', 'Transmettre un bilan par blessé']),
  phases: [
    ph('evaluation', 'Évaluation', 'Vous évaluez les six blessés.', T(90),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. SIX blessés, DEUX rouges, UN jaune, TROIS verts. PARLEZ.']], []),
    ph('traitement', 'Traitement', 'Vous traitez les rouges.', T(240),
      [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. En route, SEPT minutes. PARLEZ.']], ['Un vert s\'aggrave']),
    ph('transmission', 'Transmission', 'Vous transmettez les bilans.', TENS(0.5),
      [['MÉDECIN', 'SANTÉ UN ICI MÉDECIN. Bilan blessé UN : traumatisme crânien, conscience altérée. PARLEZ.']], []),
    ph('fin', 'Fin', 'Les secours arrivent.', FIN, [['SANTÉ 1', 'MÉDECIN ICI SANTÉ UN. Arrivée. TERMINÉ.']], []),
  ],
  objectives: [
    ob('o1', 'Traiter les deux cas rouges en premier', 'soigner', { target: 'rouge', count: 2 }),
    ob('o2', 'Transmettre six bilans justes', 'personnalise', { target: 'bilan_radio', count: 6 }),
    os('o3', 'Surveiller l\'évolution des cas verts', 'secourir', { target: 'vert', count: 3 }),
    os('o4', 'Garder son binôme actif sur la brûlure', 'proteger_les_siens', { target: 'binome' }),
  ],
  failures: [fail('victime_non_secourue', 'Un cas rouge est traité en dernier.'), fail('personnalise', 'Un bilan est faux.')],
  randomEvents: ['Un vert s\'aggrave', 'Un manifestant demande de l\'aide en priorité', 'La radio tombe en panne', 'Un projectile tombe à proximité'],
  unique: 'Le tri sans ressources : l\'éthique du choix à l\'état brut.',
  tags: ['tri', 'binome'],
});

export const MEDECIN: MissionDef[] = [MED_01, MED_02, MED_03, MED_04, MED_05, MED_06, MED_07, MED_08];
