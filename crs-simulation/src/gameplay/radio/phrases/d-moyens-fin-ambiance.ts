/* Radio — circulation et métro, moyens spéciaux, liaison, presse, densité, fin de mission, ambiance. */

import { group } from './define';
import type { PhraseDef } from './define';

const cir = group('Circulation et métro');
const moy = group('Moyens spéciaux');
const lia = group('Liaison, presse et densité');
const fin = group('Fin de mission');
/**
 * Ambiance : faible priorité, aucune réponse attendue (« TERMINÉ »). Émise par le générateur d'ambiance : les unités
 * rendent compte à leur commandant sur le canal de la compagnie (le commandant, lui, rend compte à la salle).
 */
const amb = group('Ambiance', { prio: 0, fin: 'termine', a: 'commandant' });

export const PHRASES_MOYENS_FIN_AMBIANCE: readonly PhraseDef[] = [
  // ── circulation ──
  cir('ordre_couper_circulation', { de: 'commandant', a: 'cible' }, [
    'Coupez la circulation : {voie}. Barrières et véhicule en travers, déviation des automobilistes.',
    'Fermez à la circulation : {voie}. Un véhicule en travers, des agents postés font faire demi-tour.',
    'Circulation à couper : {voie}. Barrières posées, agents postés, déviation à mettre en place.',
  ]),
  cir('rue_fermee', {}, [
    'Circulation coupée : {voie}. Barrières posées, déviation en place.',
    'Voie fermée à la circulation : {voie}. Agents postés, les automobilistes font demi-tour.',
    'Fermeture effectuée : {voie}. Véhicule en travers, déviation en place.',
    'Rue barrée : {voie}. Barrières et agents en place, circulation déviée.',
  ]),
  cir('ordre_rouvrir_circulation', { de: 'commandant', a: 'cible' }, [
    'Rouvrez à la circulation : {voie}. Retirez les barrières et rendez compte.',
    'Réouverture à effectuer : {voie}. Barrières retirées, véhicule dégagé, puis compte rendu.',
    'Levez la fermeture : {voie}. Vous rendez compte quand la circulation a repris.',
  ]),
  cir('rue_rouverte', {}, [
    'Réouverture effectuée : {voie}. La circulation reprend.',
    'Barrières retirées : {voie}. Circulation rétablie.',
    'Voie rouverte : {voie}. Les véhicules passent de nouveau.',
  ]),
  cir('perimetre_ferme', {}, [
    'Périmètre fermé à la circulation, secteur {lieu}. Nombre de points de fermeture : {nombre}. Déviation en place.',
    'Zone interdite à la circulation, secteur {lieu}. Nombre de points de fermeture : {nombre}. Riverains et secours seuls admis.',
    'Bouclage du périmètre effectué, secteur {lieu}. Nombre d\'accès fermés à la circulation : {nombre}.',
  ]),
  cir('circulation_danger', { prio: 2 }, [
    'URGENT. Le cortège arrive sur une voie encore ouverte : {voie}. Automobilistes en danger, je demande la fermeture.',
    'URGENT. Circulation non coupée devant la tête de cortège : {voie}. Des véhicules sont pris dans la foule, fermeture nécessaire.',
    'URGENT. Voie restée ouverte sur le passage du cortège : {voie}. Véhicules bloqués dans la foule, il faut couper en amont.',
  ]),

  // ── métro : les bouches sont des points d'arrivée et de départ de la foule ──
  cir('station_fermeture_demande', { de: 'commandant' }, [
    'Je demande la fermeture de la station {station}.',
    'Demande de fermeture de la station {station}, pour tarir les arrivées par cette bouche.',
    'Fermez la station {station} : plus d\'arrivées par cette bouche.',
  ]),
  cir('station_fermee', { de: 'central', a: 'tous' }, [
    'Station {station} fermée à la demande du commandement. Les arrivées se reportent sur les stations voisines.',
    'La station {station} est fermée. Plus d\'arrivées par cette bouche, surveillez les stations voisines.',
    'Fermeture de la station {station} effective. Report attendu sur les stations voisines.',
  ]),
  cir('station_reouverture_demande', { de: 'commandant' }, [
    'Je demande la réouverture de la station {station}.',
    'Demande de réouverture de la station {station}, pour faciliter les départs.',
    'Rouvrez la station {station} : la foule doit pouvoir repartir par le métro.',
  ]),
  cir('station_rouverte', { de: 'central', a: 'tous' }, [
    'Station {station} rouverte. Les voyageurs peuvent de nouveau l\'emprunter.',
    'La station {station} est rouverte. Arrivées et départs reprennent par cette bouche.',
    'Réouverture de la station {station} effective. Les accès sont de nouveau libres.',
  ]),
  cir('metro_arrivee', {}, [
    'Arrivées par le métro, station {station}. Volume de la vague : {nombre}.',
    'Vague de manifestants à la sortie de la station {station}. Volume : {nombre}.',
    'Nouvelle vague sortie du métro, station {station}. Volume : {nombre}, la foule grossit.',
    'Flux d\'arrivée par la station {station}. Volume de la vague : {nombre}.',
  ]),
  cir('metro_flux_deplace', {}, [
    'Report du flux : les arrivées se font maintenant par la station {station}.',
    'Les arrivées se reportent sur la station {station}.',
    'Depuis la fermeture, le flux d\'arrivée passe par la station {station}.',
  ]),
  cir('metro_departs', {}, [
    'Départs par le métro, station {station}. La foule quitte les lieux par cette bouche.',
    'Les manifestants repartent par la station {station}. Flux de départ régulier.',
    'La foule s\'écoule par le métro, station {station}.',
  ]),
  cir('ordre_filtrer_station', { de: 'commandant', a: 'cible' }, [
    'Filtrez la sortie de la station {station}. Contrôle des arrivants, compte rendu une fois en place.',
    'Mettez en place un filtrage à la sortie de la station {station}. Rendez compte une fois en place.',
    'Contrôlez la sortie de la station {station}. Filtrage jusqu\'à nouvel ordre, compte rendu à la mise en place.',
  ]),
  cir('sortie_filtree', {}, [
    'Sortie de la station {station} filtrée. Contrôles en place, flux ralenti.',
    'Filtrage en place à la station {station}. Les arrivants sont contrôlés à la sortie, flux ralenti.',
    'Contrôle des sorties de la station {station} en place. Arrivées ralenties.',
  ]),

  // ── moyens spéciaux : drone, canon à eau, Centaure, BRAV-M ──
  moy('drone_ordre', { de: 'commandant', a: 'drone' }, [
    'Portez votre observation sur le secteur {lieu}. Recherchez les signes de regroupement.',
    'Survolez le secteur {lieu}. Je veux le volume, l\'attitude et les regroupements suspects.',
    'Observation demandée sur le secteur {lieu}. Signalez tout signe avant-coureur.',
  ]),
  moy('drone_observation', { de: 'drone' }, [
    'Observation, secteur {lieu}. Volume : {nombre}. Attitude : {attitude}.',
    'Vue aérienne, secteur {lieu}. Volume : {nombre}. Attitude : {attitude}.',
    'Survol du secteur {lieu}. Volume estimé : {nombre}. Attitude : {attitude}.',
    'Compte rendu d\'observation, secteur {lieu}. Volume : {nombre}. Attitude : {attitude}.',
  ]),
  moy('drone_signalement', { de: 'drone', prio: 2 }, [
    'Groupe à risque repéré, secteur {lieu}. Effectif : {nombre}. Direction : {vers}.',
    'Je vous signale un groupe à risque, secteur {lieu}. Effectif : {nombre}. Direction prise : {vers}.',
    'Groupe à surveiller, secteur {lieu}. Effectif : {nombre}. Il se déplace, direction : {vers}.',
  ]),
  moy('drone_objectif', { de: 'drone', prio: 2 }, [
    'Objectif désigné, secteur {lieu} : auteur de violences, fait filmé. Signalement : {signalement}.',
    'Je vous désigne un objectif, secteur {lieu}, fait filmé. Signalement : {signalement}.',
    'Auteur de violences suivi à l\'image, secteur {lieu}. Signalement : {signalement}.',
  ]),
  moy('drone_batterie', { de: 'drone' }, [
    'Batterie basse, retour dans {duree} minutes. Plus de vue aérienne pendant la relève.',
    'Autonomie limitée : je rentre dans {duree} minutes pour changer de batterie.',
    'Fin de batterie dans {duree} minutes. Je ramène le drone, observation interrompue le temps de la relève.',
  ]),
  moy('canon_ordre_extinction', { de: 'commandant', a: 'canon' }, [
    'Éteignez le feu, secteur {lieu}. Nature : {type}. Extinction seulement, aucun jet sur les personnes.',
    'Feu à éteindre, secteur {lieu}. Nature : {type}. Vous arrosez le foyer, pas la foule.',
    'Extinction demandée, secteur {lieu}. Nature : {type}. Jet sur le foyer uniquement.',
  ]),
  moy('canon_ordre_jet', { de: 'commandant', a: 'canon', prio: 2 }, [
    'Jet diffus devant la ligne, secteur {lieu}, sur mon ordre. Jamais à la tête.',
    'Emploi du canon à eau, secteur {lieu} : jet diffus pour repousser, sur mon ordre. Aucun jet à la tête.',
    'Canon à eau en jet diffus, secteur {lieu}. Vous attendez mon ordre, jamais de jet à la tête.',
  ]),
  moy('canon_batterie', { de: 'canon', a: 'commandant' }, [
    'Canon à eau en position, secteur {lieu}, face {direction}. Cuve : {litres} litres.',
    'Engin lanceur d\'eau en place, secteur {lieu}, face {direction}. Il reste {litres} litres.',
    'En position derrière la ligne, secteur {lieu}, face {direction}. Réserve d\'eau : {litres} litres.',
  ]),
  moy('canon_feu_eteint', { de: 'canon', a: 'commandant' }, [
    'Feu éteint, secteur {lieu}. Il reste {litres} litres.',
    'Foyer éteint au canon à eau, secteur {lieu}. Réserve : {litres} litres.',
    'Extinction terminée, secteur {lieu}. Je cesse le jet, il reste {litres} litres.',
  ]),
  moy('canon_citerne_basse', { de: 'canon', a: 'commandant', prio: 2 }, [
    'URGENT. Cuve presque vide, il reste {eau} litres. Je demande à me ravitailler en eau.',
    'URGENT. Réserve d\'eau basse : {eau} litres. Je demande à me ravitailler.',
    'URGENT. Il ne reste que {eau} litres dans la cuve. Ravitaillement sur bouche d\'incendie nécessaire.',
  ]),
  moy('centaure_ordre_degager', { de: 'commandant', a: 'centaure' }, [
    'Vérifiez l\'obstacle, puis dégagez la barricade, secteur {lieu}. À la lame, à l\'allure du pas.',
    'Barricade à dégager, secteur {lieu}. Vous vérifiez qu\'il n\'y a personne derrière, puis vous poussez à la lame.',
    'Dégagez la barricade à la lame, secteur {lieu}, après vérification de l\'obstacle.',
  ]),
  moy('centaure_ordre_salve', { de: 'commandant', a: 'centaure', prio: 2, fin: 'aucun' }, [
    'Salve de lacrymogènes, secteur {lieu}, tir courbe. Nombre de grenades : {nombre}. FAITES L\'APERÇU.',
    'Lance-grenades : une salve sur le secteur {lieu}, tir courbe. Nombre de grenades : {nombre}. FAITES L\'APERÇU.',
    'Tirez une salve en tir courbe sur le secteur {lieu}. Nombre de grenades : {nombre}. FAITES L\'APERÇU.',
  ]),
  moy('centaure_position', { de: 'centaure', a: 'commandant' }, [
    'Centaure en position, secteur {lieu}, face {direction}. Lame prête.',
    'Engin blindé en place, secteur {lieu}, face {direction}. Lame et lance-grenades prêts.',
    'En position, secteur {lieu}, face {direction}. Prêt à pousser ou à tirer sur ordre.',
  ]),
  moy('centaure_salve', { de: 'centaure', a: 'commandant' }, [
    'Salve tirée, secteur {lieu}. Tir courbe, nombre de grenades : {nombre}.',
    'Salve de lacrymogènes effectuée, secteur {lieu}. Tir courbe, nombre de grenades tirées : {nombre}.',
    'Tir effectué, secteur {lieu}. Salve en tir courbe, nombre de grenades : {nombre}.',
  ]),
  moy('barricade_degagee', { de: 'centaure', a: 'commandant' }, [
    'Barricade dégagée, secteur {lieu}. Obstacle vérifié puis poussé sur le côté, voie ouverte.',
    'Barricade écartée à la lame, secteur {lieu}. Chaussée libre.',
    'Obstacle dégagé, secteur {lieu}. La voie est ouverte, les unités peuvent passer.',
    'Barricade enlevée, secteur {lieu}. Débris repoussés sur le côté de la chaussée.',
  ]),
  moy('bravm_ordre', { de: 'commandant', a: 'bravm', prio: 2 }, [
    'Groupe auteur de dégradations, secteur {lieu}. Effectif : {nombre}. Interpellez sur fait constaté.',
    'Dégradations en cours, secteur {lieu}. Effectif du groupe : {nombre}. Portez-vous sur place et interpellez sur fait constaté.',
    'Objectif pour vous, secteur {lieu} : groupe auteur de dégradations, effectif : {nombre}. Interpellation sur fait constaté.',
  ]),
  moy('bravm_en_route', { de: 'bravm', a: 'commandant', fin: 'termine', reponse: true }, [
    'REÇU, en route vers le secteur {destination}. Délai : {duree} minutes.',
    'APERÇU. Je me porte sur le secteur {destination}, arrivée dans {duree} minutes.',
    'REÇU. Colonne en mouvement vers le secteur {destination}, délai : {duree} minutes.',
  ]),
  moy('bravm_pied_a_terre', { de: 'bravm', a: 'commandant' }, [
    'Pied à terre à {distance} mètres de l\'objectif, secteur {lieu}. Les machines sont gardées, progression à pied.',
    'Débarquement effectué, secteur {lieu}, à {distance} mètres de l\'objectif. Motos gardées, je progresse à pied.',
    'Motos arrêtées à {distance} mètres de l\'objectif, secteur {lieu}. Garde des machines en place, approche à pied.',
  ]),

  // ── liaison avec les organisateurs, presse, densité ──
  lia('liaison_ordre', { de: 'commandant', a: 'liaison' }, [
    'Prenez contact avec les organisateurs, secteur {lieu}. Demandez {demande}.',
    'Allez au service d\'ordre du cortège, secteur {lieu}. Objet de la demande : {demande}.',
    'Dialogue à engager avec les organisateurs, secteur {lieu}. Vous leur demandez {demande}.',
  ]),
  lia('liaison_contact', { de: 'liaison', a: 'commandant' }, [
    'Contact établi avec le service d\'ordre du cortège, secteur {lieu}. Dialogue en cours.',
    'Nous sommes avec les organisateurs, secteur {lieu}. Discussion engagée.',
    'Contact pris avec les responsables du cortège, secteur {lieu}. Ils acceptent de discuter.',
  ]),
  lia('liaison_accord', { de: 'liaison', a: 'commandant' }, [
    'Accord des organisateurs, secteur {lieu}. Ils acceptent {demande}.',
    'Les organisateurs acceptent {demande}, secteur {lieu}. Leur service d\'ordre s\'en charge.',
    'Demande acceptée par les organisateurs, secteur {lieu} : {demande}.',
  ]),
  lia('liaison_refus', { de: 'liaison', a: 'commandant', prio: 2 }, [
    'Refus des organisateurs, secteur {lieu}. Ils n\'acceptent pas {demande}.',
    'Les organisateurs refusent {demande}, secteur {lieu}.',
    'Demande refusée par les organisateurs, secteur {lieu} : {demande}.',
  ]),
  lia('liaison_dispersion_annoncee', { de: 'liaison', a: 'commandant' }, [
    'Les organisateurs annoncent la dispersion dans {duree} minutes. Sortie prévue : {issue}.',
    'Dispersion annoncée par les organisateurs dans {duree} minutes. Sortie de la foule : {issue}.',
    'Les organisateurs vont appeler à la dispersion dans {duree} minutes. Sortie : {issue}.',
  ]),
  lia('presse_identifiee', {}, [
    'Journalistes identifiés devant le dispositif, secteur {lieu}. Nombre : {nombre}. Je les laisse passer.',
    'Presse sur place, secteur {lieu}. Nombre de journalistes : {nombre}. Ils circulent librement, je les laisse travailler.',
    'Équipe de presse au contact du dispositif, secteur {lieu}. Nombre : {nombre}. Passage laissé libre.',
  ]),
  lia('densite_critique', { prio: 2 }, [
    'URGENT. Densité critique, secteur {lieu}. Plus de quatre personnes au mètre carré, il faut ouvrir une issue.',
    'URGENT. Risque de compression, secteur {lieu}. Foule trop dense, je demande l\'ouverture d\'une issue.',
    'URGENT. Foule comprimée, secteur {lieu}. Plus de quatre personnes au mètre carré, une issue doit être libérée.',
  ]),
  lia('issue_ouverte', {}, [
    'Issue ouverte, secteur {lieu} : {issue}. La foule peut s\'écouler.',
    'Je libère une issue, secteur {lieu} : {issue}. La foule peut s\'écouler.',
    'Issue dégagée pour la foule, secteur {lieu} : {issue}.',
  ]),
  lia('densite_normale', {}, [
    'Densité revenue à la normale, secteur {lieu}. Plus de risque de compression.',
    'La foule se desserre, secteur {lieu}. Densité redevenue normale.',
    'Pression relâchée, secteur {lieu}. Plus de risque de bousculade.',
  ]),
  lia('bousculade', { prio: 2 }, [
    'URGENT. Mouvement de foule, secteur {lieu}. Personnes au sol, je suspends toute manœuvre et je demande SANTÉ.',
    'URGENT. Bousculade, secteur {lieu}. Des personnes sont tombées, j\'arrête la manœuvre et je demande SANTÉ.',
    'URGENT. Panique dans la foule, secteur {lieu}. Chutes en série, manœuvre suspendue, demande SANTÉ sur place.',
  ]),

  // ── fin de mission ──
  fin('debut_mission', { de: 'commandant', a: 'tous', fin: 'termine' }, [
    'Début de la mission à {heure}. Chacun à son poste, secteur {lieu}.',
    'Mission engagée à {heure}, secteur {lieu}. Toutes les unités à leur poste.',
    'Il est {heure} : début de la mission, secteur {lieu}. Chaque unité rejoint son poste.',
  ]),
  fin('bilan_force', {}, [
    'Consommation. Lacrymogènes à main : {nombre}. Au lanceur : {lanceur}. Tirs de lanceur de balles de défense : {lbd}. Agents blessés : {indisponibles}. Interpellés : {interpelles}.',
    'Bilan de l\'emploi de la force. Grenades à main : {nombre}. Grenades au lanceur : {lanceur}. Tirs de balles de défense : {lbd}. Agents blessés : {indisponibles}. Interpellés : {interpelles}.',
    'Compte rendu de consommation. Lacrymogènes à main : {nombre}. Au lanceur : {lanceur}. Balles de défense : {lbd}. Blessés dans l\'unité : {indisponibles}. Interpellations : {interpelles}.',
  ]),
  fin('fin_mission', {}, [
    'Fin de mission à {heure}, secteur {lieu}. Dispersion terminée, plus aucun trouble.',
    'Fin de mission à {heure}. Le secteur {lieu} est libre, plus de trouble.',
    'Mission terminée à {heure}, secteur {lieu}. Plus de trouble, je prépare le retour.',
  ]),
  fin('retour_base', {}, [
    'Retour au cantonnement. Embarquement terminé, véhicules en colonne.',
    'Nous regagnons le cantonnement. Véhicules en colonne, compte rendu écrit à suivre.',
    'Départ pour le cantonnement, véhicules en colonne. Matériel et munitions recomptés.',
    'En route pour le cantonnement. Compagnie en colonne, compte rendu à suivre.',
  ]),

  // ── ambiance (émise par le générateur ; chaque thème n'est choisi que s'il est vrai dans le monde) ──
  amb('ambiance_ras', {}, [
    'Rien à signaler, secteur {lieu}.',
    'Néant, secteur {lieu}. Les agents patientent.',
    'Rien à signaler, secteur {lieu}. Nous restons en attente.',
    'Situation calme, secteur {lieu}.',
    'Pas de mouvement notable, secteur {lieu}. Les agents restent à leur poste.',
  ]),
  amb('ambiance_rassemblement', {}, [
    'Le rassemblement se constitue, secteur {lieu}. Volume : {nombre}.',
    'Arrivées régulières, secteur {lieu}. Volume : {nombre}, ambiance détendue.',
    'Le cortège se forme, secteur {lieu}. Volume : {nombre}, en hausse.',
    'Rassemblement en cours, secteur {lieu}. Volume : {nombre}. Banderoles déployées, prises de parole.',
    'Des groupes arrivent encore, secteur {lieu}. Volume : {nombre}. La tête de cortège se met en place.',
  ]),
  amb('ambiance_cortege', {}, [
    'Le cortège avance, secteur {lieu}. Volume : {nombre}, rien d\'anormal.',
    'Cortège en marche, secteur {lieu}. Volume : {nombre}, allure régulière.',
    'Progression normale du cortège, secteur {lieu}. Volume : {nombre}, aucun incident.',
    'Le cortège passe, secteur {lieu}. Volume : {nombre}, ambiance tranquille.',
    'Cortège en bon ordre, secteur {lieu}. Volume : {nombre}, drapeaux et ballons en tête.',
  ]),
  amb('ambiance_slogans', {}, [
    'Slogans repris en chœur, secteur {lieu}. Ambiance bon enfant.',
    'Musique et sono en tête de cortège, secteur {lieu}. Les participants chantent.',
    'Cortège revendicatif mais calme, secteur {lieu}. Pancartes et ballons levés.',
    'Prises de parole au porte-voix, secteur {lieu}. La foule écoute et applaudit.',
    'Slogans et tambours, secteur {lieu}. Aucun geste hostile envers les unités.',
  ]),
  amb('ambiance_vigilance', {}, [
    'Ambiance qui se tend un peu, secteur {lieu}. Je reste vigilant.',
    'Quelques éléments nerveux, secteur {lieu}. Je surveille la tête de cortège.',
    'Vigilance maintenue, secteur {lieu}. Des groupes se rapprochent du dispositif.',
    'Un peu d\'agitation, secteur {lieu}. Rien de grave pour l\'instant.',
    'Je garde un œil sur un groupe en retrait, secteur {lieu}. Rien d\'anormal pour le moment.',
  ]),
  amb('ambiance_tension', {}, [
    'Tension palpable, secteur {lieu}. Groupes déterminés devant la ligne.',
    'Climat tendu, secteur {lieu}. Les invectives se multiplient, je garde ma réserve à portée.',
    'L\'ambiance se durcit, secteur {lieu}. Huées et gestes hostiles, je maintiens la distance.',
    'Pression sur la ligne, secteur {lieu}. La foule est nerveuse et recule à peine.',
    'Les esprits s\'échauffent, secteur {lieu}. Je resserre la ligne.',
  ]),
  amb('ambiance_affrontement', {}, [
    'Affrontements en cours, secteur {lieu}. La ligne tient.',
    'Violences persistantes, secteur {lieu}. Les agents tiennent la ligne.',
    'Contact soutenu avec les groupes violents, secteur {lieu}. Les boucliers encaissent.',
    'Heurts en continu, secteur {lieu}. Boucliers levés, la ligne ne cède pas.',
    'Toujours sous pression, secteur {lieu}. Je tiens la position.',
  ]),
  amb('ambiance_dispersion', {}, [
    'Dispersion en cours, secteur {lieu}. Volume restant : {nombre}.',
    'Les manifestants se dispersent, secteur {lieu}. Volume restant : {nombre}.',
    'Les lieux se vident, secteur {lieu}. Volume restant : {nombre}, je surveille les départs.',
    'Reflux de la foule, secteur {lieu}. Volume restant : {nombre}.',
    'Les groupes s\'éloignent, secteur {lieu}. Volume restant : {nombre}, je suis le mouvement à distance.',
  ]),
  amb('ambiance_groupes_mobiles', {}, [
    'Petits groupes mobiles dans les rues adjacentes, secteur {lieu}. Je les suis à distance.',
    'Des groupes se reforment après la dispersion, secteur {lieu}. Je garde le contact visuel.',
    'Cortège sauvage possible, secteur {lieu}. Des groupes circulent hors parcours, je surveille.',
    'Groupes épars en mouvement, secteur {lieu}. Ils changent souvent de rue, je suis leur direction.',
    'Rues adjacentes encore agitées, secteur {lieu}. Petits groupes en déplacement, vigilance maintenue.',
  ]),
  amb('ambiance_apres', {}, [
    'Calme revenu, secteur {lieu}. Reconnaissance des abords en cours.',
    'Fin de manifestation, secteur {lieu}. Je reconnais les rues adjacentes.',
    'Plus de manifestants en vue, secteur {lieu}. Je reconnais les abords.',
    'Dispositif en cours d\'allégement, secteur {lieu}. Retour progressif à la normale.',
    'Chaussée presque libre, secteur {lieu}. Vérification des abords avant la levée du dispositif.',
  ]),
  amb('ambiance_logistique', {}, [
    'Eau distribuée aux agents, secteur {lieu}.',
    'Point logistique, secteur {lieu}. Les fourgons fournissent l\'eau et les masques de rechange.',
    'Les agents sont en place depuis un bon moment, secteur {lieu}. Je les fais souffler à tour de rôle.',
    'Passage aux véhicules pour boire, secteur {lieu}, un groupe après l\'autre.',
    'La fatigue s\'installe, secteur {lieu}. Je fais alterner les agents.',
  ]),
  amb('ambiance_circulation', {}, [
    'Circulation déviée aux abords, secteur {lieu}. Les déviations tiennent.',
    'Ralentissement en amont de la fermeture, secteur {lieu}. Les automobilistes font demi-tour.',
    'Des véhicules cherchent encore à passer, secteur {lieu}. Les agents postés les renvoient sur la déviation.',
    'Bus et taxis déviés, secteur {lieu}. La fermeture est respectée.',
    'Les rues voisines se chargent de voitures déviées, secteur {lieu}. Rien d\'anormal.',
  ]),
  amb('ambiance_foyers', {}, [
    'Fumée noire visible, secteur {lieu}. Un feu est en cours sur la voie publique.',
    'Feu en cours sur la voie publique, secteur {lieu}. Je surveille la propagation.',
    'Fumée épaisse, secteur {lieu}. Le foyer est toujours actif.',
    'Un foyer brûle encore, secteur {lieu}. Je le garde à l\'œil.',
    'Flammes et fumée noire, secteur {lieu}. Le feu n\'est pas encore éteint.',
  ]),
  amb('ambiance_secours_veille', {}, [
    'Secours en attente, secteur {lieu}. Prêts à intervenir sur demande.',
    'Les secours sont stationnés, secteur {lieu}. Ils restent à l\'écoute.',
    'Équipe de secours en place, secteur {lieu}. Elle attend un appel.',
    'Moyens de secours prépositionnés, secteur {lieu}. Accès maintenu libre.',
    'Secours à l\'écoute, secteur {lieu}. Couloir d\'accès dégagé.',
  ]),
  amb('ambiance_presse', {}, [
    'Journalistes au contact du dispositif, secteur {lieu}. Tout est filmé.',
    'Équipes de presse devant la ligne, secteur {lieu}. Elles filment, je les laisse travailler.',
    'Caméras et téléphones levés, secteur {lieu}. Tout est filmé, les agents le savent.',
    'Photographes sur place, secteur {lieu}. Ils circulent librement le long du dispositif.',
    'Presse présente, secteur {lieu}. Rappel aux agents : tout geste est filmé.',
  ]),
  amb('ambiance_effectif', {}, [
    'Point d\'effectif, secteur {lieu}. Nombre d\'agents aptes : {nombre}.',
    'Effectif vérifié, secteur {lieu}. Nombre d\'agents aptes : {nombre}.',
    'Vérification de l\'effectif faite, secteur {lieu}. Nombre d\'agents aptes : {nombre}.',
    'Compte de l\'unité fait, secteur {lieu}. Nombre d\'agents aptes : {nombre}.',
    'Tour d\'effectif terminé, secteur {lieu}. Nombre d\'agents aptes : {nombre}.',
  ]),
  amb('ambiance_heure', { de: 'central', a: 'tous' }, [
    'Il est {heure}. Point horaire.',
    'Point horaire : {heure}. Toutes les unités restent à l\'écoute.',
    'Heure : {heure}. Rendez compte de tout fait notable.',
    'Il est {heure}. Restez attentifs sur le réseau.',
    'Rappel horaire : {heure}. Maintenez l\'écoute et signalez tout fait nouveau.',
  ]),
  amb('ambiance_meteo', {}, [
    'Météo, secteur {lieu} : {meteo}. Les agents adaptent leur équipement.',
    'Point météo, secteur {lieu} : {meteo}.',
    'Conditions du moment, secteur {lieu} : {meteo}. J\'en tiens compte pour les gaz.',
    'Météo : {meteo}, secteur {lieu}. Équipement ajusté.',
    'Temps sur le secteur {lieu} : {meteo}.',
  ]),
];
