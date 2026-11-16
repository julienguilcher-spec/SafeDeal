/* =====================================================================================
 * Catalogue — CRS de base (gardien stagiaire puis gardien de la paix) : bouclier, lanceur,
 * LBD, extincteur, interpellation. Le joueur reçoit les ordres et tient son poste.
 * ===================================================================================== */

import type { MissionDef } from '../../../core/missions-schema';
import { crowd, fail, forces, FIN, intel, mission, OBJ, ob, os, ph, rad, SOMMATIONS, T, voix } from './dsl';
import type { MissionSpec } from './dsl';
import { CRS_07, CRS_08, CRS_09, CRS_10, CRS_11, CRS_12 } from './crs-suite';

const STAGIAIRE: Pick<MissionSpec, 'role' | 'rank'> = { role: 'crs', rank: 'gardien_stagiaire' };
const GARDIEN: Pick<MissionSpec, 'role' | 'rank'> = { role: 'crs', rank: 'gardien' };

export const CRS_01 = mission({
  ...STAGIAIRE, poste: 'bouclier',
  id: 'crs-01-premier-samedi',
  title: 'Premier samedi',
  pitch: 'Votre première sortie en rang : une marche paisible, un bouclier à tenir et surtout rien à faire d\'autre que rester à sa place.',
  briefing: [
    `Le « Front commun des Ateliers » défile contre le « projet Horizon » : quatre cents marcheurs partent de la rue Amelot et descendent le boulevard Beaumarchais. Vous êtes gardien stagiaire dans une section de seize agents placée en réserve, invisible du cortège. Le temps est clair et l'ambiance bon enfant.`,
    `Votre mission est d'exécuter les ordres de votre chef de groupe sans délai, de tenir votre place dans la ligne de principe à l'angle du boulevard, et de ne pas lever le bâton sans ordre. Le vrai travail du jour est de contrôler votre matériel et de vous habituer au rythme d'une manifestation.`,
    `Contrôlez au fourgon six points : casque, bouclier, bâton de défense, aérosol lacrymogène, radio, numéro d'identification visible. Attendez en rue parallèle jusqu'à l'appel du groupe. Prenez place dans la ligne à moins d'un mètre de vos voisins. Quand la dispersion s'achève place de la Bastille, laissez sortir la foule par la rue Saint-Antoine.`,
    `Ne quittez pas la ligne plus de quatre-vingt-dix secondes sans ordre. Répondez poliment aux touristes et aux manifestants qui s'adressent à vous. Le port du matériel complet est obligatoire, même par beau temps.`,
  ],
  type: 'manifestation_declaree', place: 'Rue Amelot', timeOfDay: 14, weather: 'clair', windFrom: 270, windSpeed: 3, duration: 'courte',
  crowd: crowd(400, 'pouvoir_achat', 0.05, 0.1, 0, { syndical: 0.5, familles: 0.2, retraites: 0.15, etudiants: 0.15 },
    ['Rue Amelot', 'Boulevard Beaumarchais', 'Place de la Bastille'], 0.4),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Quatre cents marcheurs, ambiance calme, service d\'ordre syndical.',
    'Aucun signalement.', ['Boulevard Beaumarchais', 'Place de la Bastille'],
    ['Contrôler le matériel au fourgon', 'Rester dans la ligne', 'Répondre aux questions avec courtoisie']),
  phases: [
    ph('six-points', `Six points à présenter au fourgon`,
      `Rue Amelot, les fourgons sont alignés le long du trottoir, cap vers le boulevard. Le chef de groupe passe d'un agent à l'autre : casque, bouclier, bâton de défense, aérosol, radio, numéro d'identification bien visible.`,
      T(60), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Contrôle du matériel, un par un. Rendez compte quand le groupe est prêt.`),
        voix('CHEF DE GROUPE', `Casque, bouclier, bâton, aérosol, radio, numéro. On me présente les six, dans l'ordre.`),
      ], [`La sangle de votre casque est mal réglée : le chef de groupe la fait reprendre`]),
    ph('rue-parallele', `Hors de vue, rue Amelot`,
      `Le cortège du « Front commun des Ateliers » descend le boulevard Beaumarchais à cinquante mètres de vous, derrière les immeubles. On entend la sono et les slogans ; la section attend en colonne dans la rue Amelot, sans se montrer.`,
      T(120), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Cortège en vue sur le boulevard. Nature : marche déclarée. Volume : QUATRE-ZÉRO-ZÉRO. Attitude : calme. Restez groupés, hors de vue.`, 'T'),
        voix('MANIFESTANT', `Vous en voulez un, de café ? Il est chaud, et il n'y a rien dedans, promis.`),
      ], [`Un manifestant offre un café au groupe`]),
    ph('barrage-de-principe', `Barrage de principe à l'angle du boulevard`,
      `La section sort de la rue Amelot en colonne et se met en ligne à l'angle du boulevard Beaumarchais, face au nord, à moins d'un mètre d'intervalle. Personne ne la conteste : il s'agit d'être vu, de rester droit et d'exécuter chaque ordre sans délai.`,
      OBJ('o2'), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Section en ligne ! Angle du boulevard Beaumarchais, face nord. Présence seulement, aucun emploi de la force.`),
        voix('TOURISTE', `Excusez-moi, la colonne de Juillet, c'est par où ? On nous a dit que la place était fermée.`),
      ], [`Un touriste cherche la colonne de Juillet`, `Averse de deux minutes sur le boulevard`]),
    ph('sortie-saint-antoine', `La sortie par la rue Saint-Antoine`,
      `La section a tenu son angle le temps voulu. La tête de cortège atteint la place de la Bastille, où les organisateurs annoncent la fin au micro ; la ligne pivote et s'ouvre pour laisser la foule repartir par la rue Saint-Antoine et les bouches du métro.`,
      FIN, [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Fin de manifestation annoncée par les organisateurs. Pivotez, dégagez la rue Saint-Antoine, laissez sortir.`, 'T'),
        voix('CHEF DE GROUPE', `On ouvre, on ne pousse personne. Les gens rentrent chez eux, on les regarde passer.`),
      ], [`Un enfant a perdu ses parents à l'angle de la rue Amelot`]),
  ],
  objectives: [
    ob('o1', 'Exécuter cinq ordres en moins de trois secondes chacun', 'personnalise', { target: 'ordres_executes', count: 5 }),
    ob('o2', 'Tenir sa place dans la ligne pendant au moins trois minutes et demie du barrage', 'tenir_position', { place: 'Boulevard Beaumarchais', seconds: 210 }),
    os('o3', 'Signaler deux faits utiles par radio', 'reperer_signaux', { count: 2 }),
    os('o4', 'Renseigner un touriste', 'prevention', { target: 'touriste', count: 1 }),
  ],
  failures: [fail('bavure_grave', 'Bâton levé sans ordre.'), fail('personnalise', 'Poste quitté plus de quatre-vingt-dix secondes.', 90)],
  randomEvents: ['Un touriste cherche la colonne de Juillet', 'Un manifestant offre un café', 'Averse de deux minutes', 'Un enfant se perd à l\'angle de la rue Amelot'],
  unique: 'Aucune violence : l\'essentiel du métier est d\'attendre, d\'observer et de tenir sa place.',
  difficulty: 1, chapter: 1, tags: ['debutant', 'bouclier'],
});

export const CRS_02 = mission({
  ...STAGIAIRE, poste: 'bouclier',
  id: 'crs-02-pluie-de-paves',
  title: 'Pluie de pavés',
  pitch: 'Premier jet de projectiles de votre carrière : lever le bouclier et couvrir le lanceur pendant que les sommations sont prononcées.',
  briefing: [
    `Manifestation déclarée sur le boulevard Saint-Martin, jeudi à 16 h 30. Un précortège de cent cinquante personnes dont une vingtaine de radicaux s'est détaché du cortège. Il fait gris, le vent d'ouest souffle à quinze kilomètres-heure. Vous êtes porte-bouclier du groupe 1A, dans une section de seize.`,
    `Votre mission est de tenir votre place dans la ligne, de couvrir le lanceur placé derrière vous et d'obéir aux ordres de votre chef de groupe. Vous ne ripostez qu'à l'ordre. À l'ordre de bond offensif, vous avancez en ligne et vous vous arrêtez au coup de sifflet.`,
    `Mise en ligne à l'angle de la rue du Faubourg-Saint-Martin. Au premier jet, bouclier haut. Le commandant prononce lui-même les sommations. Vous restez en ligne pendant le bond de trente mètres puis vous vous réalignez. L'emploi de la force cesse dès que la foule reflue.`,
    `Un bouclier mal tenu découvre le collègue placé derrière vous. Ne poursuivez pas celui qui vous vise : sortir de la ligne, c'est ouvrir un trou. Ne dépassez jamais le coup de sifflet de plus de deux secondes.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Saint-Martin', timeOfDay: 16.5, weather: 'couvert', windFrom: 270, windSpeed: 4,
  crowd: crowd(600, 'pouvoir_achat', 0.35, 0.6, 0.12, { syndical: 0.35, etudiants: 0.2, black_bloc: 0.1, gilets_jaunes: 0.2, familles: 0.15 },
    ['Place de la République', 'Boulevard Saint-Martin', 'Boulevard de Strasbourg'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Six cents personnes ; un précortège de cent cinquante dont vingt déterminés.',
    'Une vingtaine d\'individus encagoulés, avec protections et projectiles.',
    ['Boulevard Saint-Martin', 'Rue du Faubourg Saint-Martin'],
    ['Lever le bouclier au premier jet', 'Rester collé à votre voisin', 'Ne jamais dépasser le coup de sifflet']),
  phases: [
    ph('angle-du-faubourg', `L'angle du Faubourg-Saint-Martin`,
      `La section débarque et se met en ligne sur le boulevard Saint-Martin, à l'angle de la rue du Faubourg Saint-Martin, face à l'est. Le cortège arrive de la place de la République ; devant la banderole de tête, un précortège de cent cinquante personnes s'est détaché et se couvre le visage.`,
      T(150), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Boucliers ! Tenez l'angle de la rue du Faubourg-Saint-Martin, face est. Riposte directe seulement.`),
        voix('CHEF DE GROUPE', `Le lanceur est juste derrière toi. S'il prend un pavé, c'est que ton bouclier n'était pas où il fallait.`),
      ]),
    ph('premiers-jets', `Bouteilles d'abord, pavés ensuite`,
      `Les premières bouteilles éclatent sur la chaussée du boulevard Saint-Martin, puis les pavés arrivent, lancés depuis le terre-plein. Bouclier haut, vous couvrez le lanceur placé derrière vous ; personne ne sort du rang, personne ne répond.`,
      T(210), [
        voix('CHEF DE GROUPE', `Boucliers hauts ! On encaisse, on ne répond pas !`),
        rad('MISTRAL 1', 'MISTRAL', `Jets de projectiles sur le barrage : bouteilles et pavés, une vingtaine de lanceurs masqués devant la banderole. Je tiens l'angle.`),
      ], [`Jets de bouteilles et de pavés sur la ligne`, `Un pavé brise la visière d'un collègue`]),
    ph('sommations', `L'écharpe derrière la ligne`,
      `Derrière vous, sur le boulevard Saint-Martin, le commandant, écharpe tricolore en bandoulière, prononce au mégaphone l'annonce puis les deux sommations. Le gros du cortège s'écarte par la rue René Boulanger ; le précortège reste.`,
      T(120), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('COMMANDANT', SOMMATIONS.premiere),
        voix('COMMANDANT', SOMMATIONS.derniere),
      ], [`Le gros du cortège quitte le boulevard par la rue René Boulanger`]),
    ph('bond', `Trente mètres, puis le sifflet`,
      `À l'ordre, la ligne s'élance sur trente mètres le long du boulevard Saint-Martin, s'arrête net au coup de sifflet et se réaligne. Le précortège recule vers la place de la République sans que personne cherche le contact.`,
      T(60), [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Dernière sommation faite. Emploi de la force : bond offensif, lacrymogènes à main. Limite : place de la République.`, 'A'),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Bond offensif, TROIS-ZÉRO mètres, en avant, puis halte et réalignement. Arrêt au sifflet.`),
      ], [`Une grenade lacrymogène à main est renvoyée vers la ligne`]),
    ph('retour-en-ligne', `Chacun reprend son créneau`,
      `Le bond terminé, la section revient au pas sur l'angle de la rue du Faubourg Saint-Martin et reprend le barrage. Les jets s'espacent mais ne cessent pas : il reste à tenir son créneau jusqu'au bout, bouclier haut.`,
      OBJ('o1'), [
        voix('CHEF DE GROUPE', `Reformez ! Chacun reprend son créneau, le même qu'au départ.`),
      ], [`Retour de gaz sur la ligne par vent tournant`, `Un journaliste se plaque contre un mur, entre la ligne et la foule`]),
    ph('reflux', `Le boulevard reflue`,
      `Vous avez tenu votre place d'un bout à l'autre. Sur le boulevard Saint-Martin, le précortège se disloque vers la place de la République, et l'emploi de la force cesse dès que le trouble cesse.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Halte à l'emploi de la force : le trouble a cessé. Restez en ligne.`, 'T'),
        voix('CHEF DE GROUPE', `On souffle. Regardez vos voisins : un bleu, une entaille, on me le dit maintenant, pas ce soir.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir sa place dans la ligne pendant toute la durée des jets', 'tenir_position', { place: 'Boulevard Saint-Martin', seconds: 600 }),
    ob('o2', 'Couvrir le lanceur du groupe', 'proteger_site', { target: 'lanceur' }),
    os('o3', 'Exécuter le bond offensif sans dépasser le coup de sifflet', 'personnalise', { target: 'bond_offensif' }),
    os('o4', 'Ne pas être blessé', 'survivre'),
  ],
  failures: [fail('joueur_hors_combat', 'Hors de combat sous les projectiles.'), fail('bavure_grave', 'Coup donné sans ordre.')],
  randomEvents: ['Un pavé touche un collègue', 'Retour de gaz par vent tournant', 'Un manifestant isolé jette un fumigène', 'Un journaliste se plaque contre un mur'],
  unique: 'Vous apprenez ce que c\'est que d\'être le bouclier, pas le tireur : l\'efficacité vient de la discipline.',
  difficulty: 2, chapter: 1, tags: ['bouclier', 'projectiles'],
});

export const CRS_03 = mission({
  ...GARDIEN, poste: 'extincteur',
  id: 'crs-03-extincteur',
  title: 'Extincteur !',
  pitch: 'Un feu de poubelle entre la ligne et la foule : éteindre avant que les flammes ne montent à la façade, sous la protection de votre groupe.',
  briefing: [
    `Boulevard Haussmann, un cortège non déclaré se disperse. Des manifestants ont renversé des poubelles et les ont enflammées contre une devanture. Les pompiers sont à cinq minutes. Votre groupe est le plus proche ; vous portez l'extincteur de la section.`,
    `Votre mission est d'éteindre les feux de poubelle avant qu'ils gagnent une façade, de protéger le passage des pompiers et de ne rien laisser derrière vous. Votre chef de groupe vous couvre : vous ne quittez pas son abri.`,
    `À l'ordre, avancez derrière deux boucliers jusqu'au feu. Visez la base des flammes, jamais la fumée. Un extincteur vient à bout d'un feu de poubelle en une dizaine de secondes ; pour un véhicule embrasé, il ne suffit pas : faites appeler les pompiers. Retournez ensuite derrière la ligne.`,
    `Une batterie de trottinette électrique s'embrase violemment : n'insistez pas, reculez et demandez de l'eau. Ne vous exposez jamais à plus de dix secondes d'affilée sans couverture.`,
  ],
  type: 'protection_secours', place: 'Boulevard Haussmann', timeOfDay: 17, weather: 'couvert', windFrom: 250, windSpeed: 4,
  crowd: crowd(400, 'pouvoir_achat', 0.4, 0.5, 0.1, { gilets_jaunes: 0.3, syndical: 0.2, black_bloc: 0.1, curieux: 0.4 },
    ['Boulevard Haussmann', 'Rue Tronchet'], 0.3),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 0 }),
  intel: intel(
    'Quatre cents personnes en cours de dispersion ; quelques foyers de poubelles.',
    'Une dizaine d\'individus allument les feux et jettent des projectiles.',
    ['Boulevard Haussmann', 'Rue Tronchet'],
    ['Éteindre les petits feux avec l\'extincteur', 'Appeler les pompiers pour les gros', 'Rester sous couverture']),
  phases: [
    ph('poubelles', `Deux poubelles contre une devanture`,
      `Boulevard Haussmann, à l'angle de la rue Tronchet, deux poubelles renversées brûlent contre une devanture ; la fumée noire du plastique monte le long de la façade. Derrière deux boucliers, vous avancez jusqu'au foyer, l'extincteur à la main.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Feu de poubelles contre une façade, angle Haussmann et Tronchet. Votre extincteur dessus, deux boucliers en protection. SAPEUR UN est à CINQ minutes.`),
        voix('CHEF DE GROUPE', `Extincteur, avec moi ! Deux boucliers devant. La base des flammes, pas la fumée.`),
      ], [`Une bouteille vise le porte-extincteur`, `Retour de flamme d'une poubelle renversée`]),
    ph('batterie', `La batterie qui se rallume`,
      `Les deux poubelles sont noyées sous la poudre. Dix mètres plus loin sur le boulevard Haussmann, une trottinette électrique jetée contre une barrière s'embrase d'un coup : la batterie crépite, projette des étincelles et se rallume dès qu'on la croit éteinte.`,
      T(150), [
        voix('CHEF DE GROUPE', `Laisse la batterie, ça ne s'éteint pas à la poudre ! Recule et signale-la pour les pompiers.`),
        rad('CENTRAL', 'MISTRAL 1', `SAPEUR UN à DEUX minutes, arrivée par la rue Tronchet. Tenez-lui le passage.`),
      ], [`Une trottinette électrique prend feu`, `Un curieux filme à trois mètres du foyer`]),
    ph('couloir', `Trois mètres cinquante rue Tronchet`,
      `Le fourgon des sapeurs-pompiers remonte la rue Tronchet depuis la Madeleine, deux-tons hurlant. Le groupe ouvre un couloir de trois mètres cinquante entre les badauds et le tient, boucliers tournés vers le boulevard, pendant que la lance est mise en batterie.`,
      T(240), [
        rad('SAPEUR 1', 'MISTRAL 1', `En vue, rue Tronchet. Il me faut le passage jusqu'à l'angle et UN-ZÉRO mètres libres autour de l'engin.`),
        voix('CHEF DE GROUPE', `Couloir ! Largeur d'un fourgon, et on le tient.`),
      ], [`Un mortier d'artifice part en direction des pompiers`]),
    ph('recharge', `Recharge au fourgon`,
      `Les pompiers noient la batterie et les dernières braises pendant que le boulevard Haussmann se vide vers Saint-Lazare. Votre extincteur est presque vide : il se recharge au fourgon avant que vous repreniez place au second rang.`,
      FIN, [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Extincteur au fourgon pour recharge, puis retour au second rang.`),
        voix('SAPEUR-POMPIER', `Une batterie, ça se noie, ça ne s'étouffe pas. Vous nous la gardez à distance et vous nous appelez, c'est tout.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Éteindre deux feux de poubelle avant qu\'ils gagnent une façade', 'eteindre', { target: 'poubelle', count: 2 }),
    ob('o2', 'Garder libre le passage de l\'engin des pompiers jusqu\'à son arrivée', 'proteger_site', { target: 'couloir_secours', place: 'Rue Tronchet' }),
    os('o3', 'Ne jamais rester plus de dix secondes d\'affilée hors de la couverture des boucliers', 'personnalise', { target: 'exposition_sans_couverture', seconds: 10 }),
    os('o4', 'Signaler la batterie embrasée et la faire éteindre à l\'eau par les pompiers', 'eteindre', { target: 'batterie_trottinette', count: 1 }),
  ],
  failures: [fail('personnalise', 'Une façade prend feu.'), fail('joueur_hors_combat', 'Hors de combat sous les projectiles.')],
  randomEvents: ['Une batterie de trottinette s\'embrase', 'Un jet de bouteille vise l\'extincteur', 'Un curieux filme de trop près', 'Retour de flamme d\'une poubelle'],
  unique: 'Le métier d\'extincteur : éteindre tout en restant protégé, et savoir quand appeler plus gros.',
  difficulty: 2, chapter: 2, tags: ['extincteur', 'feu'],
});

export const CRS_04 = mission({
  ...STAGIAIRE, poste: 'bouclier',
  id: 'crs-04-le-pont-ne-passe-pas',
  title: 'Le pont ne passe pas',
  pitch: 'Interdire le pont de la Concorde pendant six minutes sans céder un mètre et sans un seul coup hors cadre.',
  briefing: [
    `Une manifestation interdite descend les Champs-Élysées vers l'Assemblée nationale : huit cents personnes en tête, d'autres derrière. Le pont de la Concorde est le point de passage obligé : il est large de trente-six mètres. Votre section tient la ligne de barrage côté rive droite. Le ciel est nuageux, le vent d'ouest faible.`,
    `Votre mission est de tenir votre place dans la ligne jusqu'à la relève, sans céder de terrain, sans frapper et sans quitter le rang. Vous êtes bouclier : vous ne ripostez pas aux insultes et ne frappez que sur ordre.`,
    `Au coude à coude, boucliers jointifs. Deuxième rang à trois mètres : chef de groupe, lanceur, extincteur. Les véhicules sont en travers à trente mètres derrière vous. Au premier mouvement de foule, serrez les rangs. À l'ordre de repli, rompez le contact par échelons.`,
    `Les manifestants, parfois nombreux, poussent sans frapper. Ne répondez pas à la poussée par un coup. Si le chef de groupe annonce un lancer de gaz, mettez votre masque sans quitter la ligne.`,
  ],
  type: 'barrage', place: 'Pont de la Concorde', timeOfDay: 16, weather: 'nuageux', windFrom: 260, windSpeed: 4,
  crowd: crowd(800, 'libertes', 0.4, 0.55, 0.08, { gilets_jaunes: 0.3, syndical: 0.25, etudiants: 0.2, familles: 0.1, curieux: 0.15 },
    ['Avenue des Champs-Élysées', 'Place de la Concorde', 'Pont de la Concorde'], 0.5),
  forces: forces({ sections: 2, fourgons: 6, pompiers: 1, samu: 1 }),
  intel: intel(
    'Huit cents personnes en tête ; poussée prévisible, quelques jets possibles.',
    'Une soixantaine d\'individus déterminés dans la tête du cortège.',
    ['Pont de la Concorde', 'Place de la Concorde', 'Cours la Reine'],
    ['Tenir au coude à coude', 'Ne pas répondre aux provocations', 'Mettre le masque à l\'ordre']),
  phases: [
    ph('installation', `Barrières et fourgons en travers`,
      `Côté rive droite, à l'entrée du pont de la Concorde, la section pose les barrières d'un parapet à l'autre et se met en ligne devant, boucliers jointifs. Trente mètres derrière vous, les fourgons se rangent en travers de la chaussée ; au fond, la colonnade du Palais Bourbon.`,
      T(150), [
        rad('MISTRAL', 'MISTRAL 1', `Mission : INTERDIRE le pont de la Concorde. Cadre : manifestation interdite. Barrage face nord, véhicules en travers à TROIS-ZÉRO mètres.`, 'A'),
        voix('CHEF DE GROUPE', `Section, en ligne ! Coude à coude, d'un parapet à l'autre.`),
      ]),
    ph('poussee', `La poussée contre les boucliers`,
      `La tête de cortège traverse la place de la Concorde et vient s'écraser sur le barrage. On ne frappe pas : les premiers rangs, poussés par ceux de derrière, pèsent de tout leur poids sur les boucliers, et la ligne recule d'un demi-pas avant de se caler.`,
      T(200), [
        voix('CHEF DE GROUPE', `Poussée ! Jambe arrière fléchie, on tient ! Pas de coup, on tient !`),
        rad('MISTRAL 1', 'MISTRAL', `Contact sur le barrage. Nature : poussée, sans coups. Volume : HUIT-ZÉRO-ZÉRO. Attitude : déterminée, premiers rangs comprimés.`),
      ], [`Une personne est coincée contre une barrière`, `Bouteilles lancées par-dessus la ligne`]),
    ph('contournement', `Par le quai des Tuileries`,
      `Une cinquantaine de personnes se détachent et filent le long du quai des Tuileries pour déborder le barrage par l'aile, au ras du parapet. Le groupe Bravo pivote pour fermer à droite ; votre créneau s'élargit d'autant, et il faut tenir plus large sans rompre.`,
      OBJ('o1'), [
        rad('MISTRAL 1', 'MISTRAL 1 BRAVO', `Contournement par le quai des Tuileries, CINQ-ZÉRO individus. Fermez l'aile droite jusqu'au parapet.`),
        voix('CHEF DE GROUPE', `Alfa, on s'étire d'un mètre à droite. Boucliers jointifs quand même !`),
      ], [`Une ambulance demande le passage par le cours la Reine`]),
    ph('sommations', `Sommations à l'entrée du pont`,
      `Le pont tient depuis six minutes. Le commandant, écharpe tricolore en bandoulière, monte à hauteur du second rang et prononce l'annonce puis les deux sommations, face à la place de la Concorde. La foule garde une issue : la rue Royale et les Champs-Élysées restent ouverts derrière elle.`,
      T(120), [
        voix('COMMANDANT', SOMMATIONS.annonce),
        voix('COMMANDANT', SOMMATIONS.premiere),
        voix('COMMANDANT', SOMMATIONS.derniere),
      ], [`Un malaise dans les premiers rangs de la foule`]),
    ph('refoulement', `Cinquante mètres, pas un de plus`,
      `À l'ordre, la ligne quitte les barrières et repousse la foule au pas sur cinquante mètres, par tronçons, jusqu'au bord de la place de la Concorde. Boucliers en avant, sans coup : on pousse, on s'arrête, on se réaligne.`,
      T(150), [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Dernière sommation faite. Emploi de la force : refoulement, lacrymogènes à main. Limite : CINQ-ZÉRO mètres, bord de la place. Issue libre devant la foule.`, 'A'),
        voix('CHEF DE GROUPE', `En avant, marche ! Au pas, on ne court pas !… Halte ! Reformez !`),
      ], [`Le chef de groupe annonce un lancer de lacrymogènes : masque à mettre sans quitter la ligne`]),
    ph('retour-au-barrage', `Retour aux barrières`,
      `Le refoulement s'arrête à la limite fixée et la section revient au pas sur ses barrières, à l'entrée du pont de la Concorde. Une section fraîche attend dix mètres derrière pour le passage de ligne ; les fourgons n'ont pas bougé.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 3', `Relevez MISTRAL UN sur place, passage de ligne.`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Relève en cours. Vous passez la ligne par la droite, récupération aux véhicules.`, 'T'),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir le pont de la Concorde pendant six minutes', 'tenir_position', { place: 'Pont de la Concorde', seconds: 360 }),
    ob('o2', 'Ne laisser personne franchir le barrage vers le Palais Bourbon', 'proteger_site', { place: 'Pont de la Concorde', target: 'franchissement', max: 0 }),
    os('o3', 'Ne porter aucun coup hors cadre', 'zero_bavure'),
    os('o4', 'Ne pas quitter le rang plus de dix secondes d\'affilée', 'personnalise', { target: 'sortie_du_rang', seconds: 10 }),
  ],
  failures: [fail('ligne_enfoncee', 'La ligne est percée.'), fail('bavure_grave', 'Un coup est porté à un manifestant pacifique.')],
  randomEvents: ['Retour de gaz par vent tournant', 'Un journaliste se plaque contre un mur', 'Un malaise dans la foule', 'Averse soudaine'],
  unique: 'Tenir sans rien faire d\'autre que résister : la patience est ici une compétence de combat.',
  difficulty: 2, chapter: 1, altRoles: ['journaliste'], tags: ['barrage', 'miroir'],
});

export const CRS_05 = mission({
  ...GARDIEN, poste: 'lanceur',
  id: 'crs-05-lanceur-designe',
  title: 'Lanceur désigné',
  pitch: 'Trois tirs en cloche, trois bonds de la section, et un vent qui tourne : savoir quand ne pas tirer fait partie du métier.',
  briefing: [
    `Boulevard Beaumarchais, une manifestation déclarée dégénère à la fin du parcours. Des projectiles tombent sur la ligne. Le commandant a prononcé les sommations, puis réitéré la dernière : l'usage des lanceurs est autorisé, en tir courbe uniquement. Vous êtes lanceur du groupe : vous servez le lanceur de grenades de 56 millimètres, sous le contrôle de votre chef de groupe, qui supervise chaque tir.`,
    `Votre mission est d'appuyer trois bonds de la section par trois tirs en cloche sur des points désignés, sans jamais viser la foule dense ni un cortège déclaré. Le vent d'ouest est faible mais tourne : le moindre retour de gaz sur la ligne vous oblige à suspendre.`,
    `À l'ordre, vous tirez à cent mètres, en cloche, sur le point désigné par le chef de groupe. Vous annoncez « Tir ! » avant chaque salve. Après le tir, regardez le nuage : s'il revient, criez « Halte au feu ! » et suspendez. Le commandant rend compte à la salle de chaque tir.`,
    `Le tir tendu est strictement interdit : c'est une faute grave. Aucun tir sans ordre, aucun tir sur une foule dense ni sur le cortège déclaré. Comptez vos grenades : huit pour le lanceur, quatre à main.`,
  ],
  type: 'manifestation_declaree', place: 'Boulevard Beaumarchais', timeOfDay: 17, weather: 'couvert', windFrom: 270, windSpeed: 3,
  crowd: crowd(900, 'pouvoir_achat', 0.45, 0.6, 0.1, { syndical: 0.3, gilets_jaunes: 0.25, etudiants: 0.15, black_bloc: 0.1, familles: 0.2 },
    ['Place de la Bastille', 'Boulevard Beaumarchais', 'Boulevard des Filles du Calvaire'], 0.45),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 1, samu: 1 }),
  intel: intel(
    'Neuf cents personnes ; un précortège violent isolé du cortège déclaré.',
    'Une trentaine d\'individus déterminés au nord du boulevard.',
    ['Boulevard Beaumarchais', 'Place de la Bastille', 'Rue du Pasteur Wagner'],
    ['Suivre le vent avant chaque tir', 'Annoncer les tirs', 'Ne tirer que sur désignation']),
  phases: [
    ph('arme-au-pied', `Arme au pied, derrière les boucliers`,
      `Boulevard Beaumarchais, à cent cinquante mètres de la place de la Bastille. Vous êtes au second rang, trois mètres derrière les boucliers, le lanceur de 56 millimètres à la bretelle ; des projectiles tombent sur la ligne et votre chef de groupe ne vous quitte pas des yeux.`,
      T(120), [
        voix('CHEF DE GROUPE', `Lanceur, arme au pied. Tu ne charges rien tant que je ne te l'ai pas dit.`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Jets nourris sur la ligne. Lanceurs en attente : aucun tir avant la réitération de la dernière sommation.`, 'T'),
      ], [`Jets de bouteilles et de pavés depuis la rue du Pasteur Wagner`]),
    ph('reiteration', `La dernière sommation, une seconde fois`,
      `Le commandant a déjà prononcé l'annonce et les deux sommations ; il reprend le mégaphone au milieu du boulevard Beaumarchais et réitère la dernière, comme la loi l'exige avant l'usage des lanceurs. Le cortège déclaré s'écoule vers le boulevard des Filles du Calvaire ; restent trois cents personnes face à la ligne.`,
      T(90), [
        voix('COMMANDANT', SOMMATIONS.derniere),
        rad('MISTRAL', 'MISTRAL 1 À 4', `Je réitère la dernière sommation. Usage des armes : lanceurs, tir courbe, CENT mètres, sur ordre des chefs de groupe.`, 'C'),
      ]),
    ph('trois-tirs', `Trois tirs en cloche, trois bonds`,
      `Le chef de groupe désigne le point : le carrefour de la rue du Pasteur Wagner, à cent mètres, loin de la queue du cortège. Vous annoncez « Tir ! », vous tirez en cloche, et la section avance de trente mètres derrière le nuage ; puis il désigne le point suivant.`,
      OBJ('o1'), [
        voix('CHEF DE GROUPE', `Lanceur ! Carrefour Pasteur-Wagner, cent mètres, tir courbe… Feu !`),
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Bond offensif, TROIS-ZÉRO mètres derrière le tir, halte et réalignement.`),
      ], [`Une famille traverse la zone désignée au moment du tir`, `Une grenade est renvoyée vers la ligne`]),
    ph('vent-tournant', `Le nuage revient`,
      `Trois tirs, trois bonds. Mais le vent d'ouest tourne au-dessus du boulevard Beaumarchais et rabat le nuage vers la ligne et vers une terrasse restée ouverte. Tout nouveau tir reviendrait sur vos collègues : il faut suspendre, le crier et attendre.`,
      T(150), [
        rad('MISTRAL 1', 'MISTRAL', `Vent de face, retour de gaz sur la ligne. Je suspends les tirs et je fais mettre les masques.`),
        voix('CHEF DE GROUPE', `Masques ! Lanceur, tu regardes ton nuage avant de recharger.`),
      ], [`Le vent tourne et ramène le nuage sur la ligne`, `Un collègue du premier rang n'a pas mis son masque`]),
    ph('halte-au-feu', `Halte au feu, compte des grenades`,
      `Le précortège reflue vers la place de la Bastille et le boulevard Beaumarchais se vide par les rues latérales. L'ordre tombe : plus un tir. Il vous reste à compter vos grenades, une à une, pour le compte rendu de consommation.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 1 À 4', `Halte à l'emploi de la force : le trouble a cessé. Rendez compte de vos consommations.`),
        voix('CHEF DE GROUPE', `Halte au feu ! Combien au lanceur, combien à main ? Je veux le chiffre exact, avec l'heure de chaque tir.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Appuyer trois bonds par trois tirs en cloche', 'personnalise', { target: 'tir_en_cloche', count: 3 }),
    ob('o2', 'Ne tirer que sur ordre et sur le point désigné, toujours en tir courbe', 'zero_bavure'),
    os('o3', 'Suspendre les tirs dans les cinq secondes qui suivent un retour de gaz', 'personnalise', { target: 'suspension_vent', seconds: 5 }),
    os('o4', 'Ne pas tirer plus de six grenades au lanceur', 'personnalise', { target: 'grenade_au_lanceur', max: 6 }),
  ],
  failures: [fail('bavure_grave', 'Tir tendu ou gaz sur le cortège déclaré.'), fail('personnalise', 'Une grenade tombe sur une foule dense.')],
  randomEvents: ['Retour de gaz par vent tournant', 'Un enfant dans le nuage', 'Un lanceur s\'enraye', 'Un collègue sans masque'],
  unique: 'Le vent est le partenaire du lanceur : un mauvais tir revient sur vous.',
  difficulty: 3, chapter: 2, altRoles: ['street_medic', 'telepilote'], tags: ['lanceur', 'vent', 'miroir'],
});

export const CRS_06 = mission({
  ...GARDIEN, poste: 'bouclier',
  id: 'crs-06-nuit-de-finale',
  title: 'Nuit de finale',
  pitch: 'La finale se joue au stade et le public se déverse sur les Champs-Élysées : de la joie, du bruit, et une minorité qui casse.',
  briefing: [
    `Samedi soir, le « Racing Lutèce » vient de gagner la coupe. Des milliers de supporters descendent les Champs-Élysées en chantant. Les stations George V et Champs-Élysées – Clemenceau déversent de nouvelles vagues toutes les deux minutes. Il pleut, mais ça ne refroidit personne.`,
    `Vous êtes gardien dans une section de seize placée à la hauteur de la rue de Marignan. Votre mission est de tenir la ligne, de canaliser le flux vers l'Arc de Triomphe, d'éviter les bousculades et d'interpeller les casseurs sur faits constatés.`,
    `Section en ligne lâche, un mètre entre chaque agent, pour laisser passer les piétons. Au premier jet de fumigène, resserrez. Les interpellateurs sortent sur ordre, par deux, à l'angle de l'avenue Matignon. Gardez libre la bande de secours.`,
    `Les supporters sont majoritairement festifs : n'employez la force que sur violence. Un fumigène lancé en l'air n'est pas une attaque. Pas de gaz sur les cortèges de fête.`,
  ],
  type: 'soir_de_match', place: 'Avenue des Champs-Élysées', timeOfDay: 22, weather: 'pluie', windFrom: 240, windSpeed: 4,
  crowd: crowd(1200, '', 0.3, 0.55, 0.04, { supporters: 0.7, fetards: 0.15, curieux: 0.15 },
    ['Avenue des Champs-Élysées', 'Place Charles de Gaulle'], 0.65),
  forces: forces({ sections: 2, fourgons: 6, drone: true, pompiers: 2, samu: 1 }),
  intel: intel(
    'Douze cents supporters ; bonne humeur, alcool, quelques fumigènes.',
    'Une trentaine de casseurs mêlés à la foule de fête.',
    ['Avenue des Champs-Élysées', 'Rue de Marignan', 'Avenue George V'],
    ['Garder une bande libre pour les secours', 'Se tenir en ligne lâche', 'Interpeller sur faits uniquement']),
  phases: [
    ph('premieres-vagues', `Les premières vagues du métro`,
      `Coup de sifflet final : le « Racing Lutèce » a gagné. Sur l'avenue des Champs-Élysées, à hauteur de la rue de Marignan, les bouches des stations George V et Champs-Élysées – Clemenceau déversent une nouvelle vague de supporters toutes les deux minutes, sous la pluie.`,
      T(180), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Ligne lâche, un mètre entre chaque agent. Laissez passer les piétons, canalisez vers l'Étoile. Présence seulement.`),
        voix('SUPPORTER', `Allez Lutèce ! Souriez, monsieur l'agent, on a gagné !`),
      ], [`Un fumigène de couleur éclate au sol devant la ligne`]),
    ph('grimpeurs', `Grimpeurs sur les feux tricolores`,
      `L'avenue est noire de monde jusqu'au Rond-Point des Champs-Élysées. Trois supporters escaladent un feu tricolore et un abribus à dix mètres de votre créneau, sous les acclamations ; la chaussée est trempée et le mobilier glisse.`,
      T(240), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `ICARE signale une densité élevée devant la rue de Marignan et TROIS grimpeurs sur le mobilier. Faites-les descendre à la voix, sans contact.`),
        voix('CHEF DE GROUPE', `Ceux-là, on leur parle. Personne ne les tire par les jambes.`),
      ], [`Un supporter escalade un feu tricolore`, `Un scooter remonte la foule à contresens`]),
    ph('vitrines', `Deux vitrines au marteau`,
      `Une trentaine d'individus capuchés quittent la fête et s'attaquent au marteau à deux vitrines, à l'angle de la rue de Marignan. Autour d'eux, la foule chante toujours : il faut resserrer la ligne, laisser sortir les interpellateurs par deux et ne saisir que ceux qu'on a vus frapper.`,
      OBJ('o2'), [
        rad('MISTRAL 1', 'MISTRAL 1 ALFA', `Vitrines brisées à l'angle de la rue de Marignan, TROIS-ZÉRO individus. Resserrez. Interpellateurs, sortez par deux, côté avenue Matignon, sur fait constaté.`),
        voix('CHEF DE GROUPE', `Pas de gaz, il y a des familles partout ! On va les chercher à la main.`),
      ], [`Deux vitrines sont attaquées au marteau`, `Un scooter est renversé et incendié`]),
    ph('bande-de-secours', `L'ambulance de l'avenue George V`,
      `Deux casseurs sont menottés et conduits aux fourgons. Une ambulance se présente à l'entrée de l'avenue George V pour un malaise dans la foule : la bande de secours doit rester libre d'un bout à l'autre, alors que deux groupes de supporters commencent à se bousculer.`,
      T(180), [
        rad('CENTRAL', 'MISTRAL 1', `SANTÉ DEUX se présente avenue George V pour un malaise. Gardez-lui la bande de secours.`),
        voix('CHEF DE GROUPE', `Couloir ! On écarte à la voix et aux bras, pas au bouclier.`),
      ], [`Une ambulance demande le passage`, `Bagarre entre deux groupes de supporters`]),
    ph('fermeture', `L'avenue se ferme par tronçons`,
      `Passé minuit, les derniers groupes regagnent le métro et les rues latérales. La section avance en ligne lâche de la rue de Marignan vers le Rond-Point des Champs-Élysées, tronçon après tronçon, jusqu'à ce que la chaussée soit rendue à la circulation.`,
      FIN, [
        rad('MISTRAL', 'MISTRAL 1 À 4', `La foule quitte l'avenue. Fermeture par tronçons de CINQ-ZÉRO mètres, sans contact. Rendez compte : blessés, interpellés.`),
      ]),
  ],
  objectives: [
    ob('o1', 'Tenir la ligne sans empêcher le flux de fête', 'tenir_position', { place: 'Avenue des Champs-Élysées', seconds: 900 }),
    ob('o2', 'Interpeller deux casseurs sur faits constatés', 'interpeller', { count: 2 }),
    os('o3', 'Ne causer aucun blessé parmi les supporters festifs', 'limiter_blesses', { max: 0 }),
    os('o4', 'Garder la bande de secours libre', 'proteger_site', { place: 'Avenue George V' }),
  ],
  failures: [fail('bavure_grave', 'Force employée sur la foule de fête.'), fail('trop_de_blesses', 'Trop de blessés.', 10)],
  randomEvents: ['Un fumigène éclate au sol', 'Un supporter escalade un feu tricolore', 'Une ambulance demande le passage', 'Bagarre entre deux groupes'],
  unique: 'Une foule joyeuse, pas de revendication : l\'ordre public se joue sur la mesure.',
  difficulty: 3, chapter: 2, tags: ['match', 'fete'],
});

export { CRS_07, CRS_08, CRS_09, CRS_10, CRS_11, CRS_12 };

export const CRS: MissionDef[] = [
  CRS_01, CRS_02, CRS_03, CRS_04, CRS_05, CRS_06, CRS_07, CRS_08, CRS_09, CRS_10, CRS_11, CRS_12,
];
