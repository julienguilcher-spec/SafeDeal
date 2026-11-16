/* Radio — circulation et métro, moyens spéciaux, liaison, presse, densité, fin de mission, ambiance. */

import { group } from './define';
import type { PhraseDef } from './define';

const cir = group('Circulation et métro');
const moy = group('Moyens spéciaux');
const lia = group('Liaison, presse et densité');
const fin = group('Fin de mission');
const amb = group('Ambiance');

export const PHRASES_MOYENS_FIN_AMBIANCE: readonly PhraseDef[] = [
  // ── circulation et métro ──
  cir('rue_fermee', {}, [
    'Circulation coupée, {voie}. Barrières posées, déviation en place.',
    'Voie fermée à la circulation : {voie}. Agent posté, demi-tour imposé aux automobilistes.',
    'Fermeture effectuée, {voie}. Véhicules déviés, bouchon en formation en amont.',
    'Rue barrée, {voie}. Véhicules de police en travers, déviation signalée.',
  ]),
  cir('rue_rouverte', {}, [
    'Réouverture de la voie : {voie}. La circulation reprend.',
    'Barrières retirées, {voie}. Circulation rétablie.',
    'Voie rouverte, {voie}. Les véhicules s\'écoulent normalement.',
  ]),
  cir('perimetre_ferme', {}, [
    'Périmètre fermé, secteur {lieu}. Accès filtrés sur {nombre} points, déviation en place.',
    'Zone interdite à la circulation, secteur {lieu}. Carrefours tenus par les agents, riverains seuls admis.',
    'Bouclage du périmètre, secteur {lieu}. Accès contrôlés sur {nombre} points.',
  ]),
  cir('station_fermee', { de: 'central', a: 'tous', canal: 'commandement' }, [
    'Fermeture de la station {station}, à la demande du commandement. Les flux sont reportés sur les stations voisines.',
    'La station {station} est fermée. Plus d\'arrivées par cette bouche, surveillez les stations voisines.',
    'Station {station} fermée par ordre du commandement. Les accès sont condamnés.',
  ]),
  cir('station_rouverte', { de: 'central', a: 'tous', canal: 'commandement' }, [
    'Réouverture de la station {station}. Les voyageurs peuvent de nouveau l\'emprunter.',
    'La station {station} est rouverte. Surveillance des sorties maintenue.',
    'Station {station} remise en service. Les arrivées reprennent par cette bouche.',
  ]),
  cir('metro_arrivee', {}, [
    'Arrivée de manifestants par le métro, station {station}. Une vague de {nombre} personnes sort sur le secteur {lieu}.',
    'Vague de manifestants sortant de la station {station}, secteur {lieu}. Effectif : {nombre}.',
    'Les rames déversent du monde à la station {station}, secteur {lieu}. Effectif : {nombre}, la foule grossit.',
    'Flux important par la station {station}. Effectif : {nombre}, tête de cortège renforcée.',
  ]),
  cir('metro_flux_deplace', {}, [
    'La fermeture a déplacé le flux : les arrivées se font maintenant par la station {station}, secteur {lieu}.',
    'Les manifestants se reportent sur la station {station}, secteur {lieu}. Effectif : {nombre}.',
    'Report de l\'affluence vers la station {station}. Arrivées en continu, secteur {lieu}.',
  ]),
  cir('sortie_filtree', {}, [
    'Sortie de la station {station} filtrée, secteur {lieu}. Contrôles à la sortie, flux ralenti.',
    'Filtrage en place à la station {station}. Les arrivants passent un par un, secteur {lieu}.',
    'Contrôle des sorties de métro, station {station}. Effectif contrôlé : {nombre}.',
  ]),

  // ── moyens spéciaux ──
  moy('drone_observation', { de: 'drone', canal: 'commandement' }, [
    'Observation : {nombre} personnes devant la banderole, secteur {lieu}. Attitude : {attitude}.',
    'Vue aérienne, secteur {lieu}. Volume : {nombre}, la tête de cortège marque l\'arrêt.',
    'Observation du drone, secteur {lieu}. Concentration de {nombre} personnes, issues dégagées côté {direction}.',
    'Survol du secteur {lieu}. Foule : {nombre}, attitude : {attitude}, aucun groupe isolé repéré.',
  ]),
  moy('drone_signalement', { de: 'drone', canal: 'commandement', prio: 2 }, [
    'Objectif repéré, secteur {lieu}. Individu en tenue sombre, auteur de jets sur la ligne.',
    'Je vous désigne un groupe de {nombre} personnes qui s\'équipe, secteur {lieu}. Ils se dirigent vers {direction}.',
    'Départ de groupe de casseurs, secteur {lieu}. Effectif : {nombre}, direction : {direction}.',
  ]),
  moy('drone_batterie', { de: 'drone', canal: 'commandement' }, [
    'Batterie basse, retour à la base dans {duree} minutes. Je demande la relève du drone.',
    'Autonomie limitée, retour en cours. Plus de vue aérienne sur le secteur {lieu} d\'ici {duree} minutes.',
    'Fin de batterie, je rentre. Observation arrêtée sur le secteur {lieu}.',
  ]),
  moy('canon_batterie', { de: 'canon', a: 'commandant' }, [
    'Canon à eau en batterie, secteur {lieu}, face {direction}. Réserve : {litres} litres.',
    'En position de tir, secteur {lieu}. Tourelle orientée face {direction}, citerne : {litres} litres.',
    'Engin lanceur d\'eau en place, secteur {lieu}. Jet prêt sur ordre, il reste {litres} litres.',
  ]),
  moy('canon_feu_eteint', { de: 'canon', a: 'commandant' }, [
    'Feu éteint, secteur {lieu}. Jet diffus maintenu devant la ligne, il reste {litres} litres.',
    'Foyer éteint par le canon, secteur {lieu}. Je reste en position, il reste {litres} litres.',
    'Barricade éteinte, secteur {lieu}. La chaussée est dégagée de la fumée, il reste {litres} litres.',
  ]),
  moy('canon_citerne_basse', { de: 'canon', a: 'commandant', prio: 2 }, [
    'URGENT. Citerne presque vide, il reste {litres} litres. Je demande un ravitaillement en eau.',
    'URGENT. Réserve d\'eau basse, il reste {litres} litres. Plus de jet prolongé possible.',
    'URGENT. Citerne à sec bientôt, il reste {litres} litres. Je me replie au point d\'eau.',
  ]),
  moy('centaure_position', { de: 'centaure', a: 'commandant' }, [
    'Centaure en position, secteur {lieu}. Obstacle vérifié, personne derrière.',
    'Engin blindé en place, secteur {lieu}. Lame prête, lanceurs chargés.',
    'En batterie, secteur {lieu}, face {direction}. Les gendarmes avancent derrière l\'engin.',
  ]),
  moy('centaure_salve', { de: 'centaure', a: 'commandant' }, [
    'Salve tirée, secteur {lieu}. Tir courbe de {nombre} grenades, zone carrefour.',
    'Salve de lacrymogènes effectuée, secteur {lieu}. Effet constaté sur le groupe de tête.',
    'Salve partie, secteur {lieu}. Tir courbe, {nombre} grenades au lanceur.',
  ]),
  moy('barricade_degagee', { de: 'centaure', a: 'commandant' }, [
    'Barricade dégagée, secteur {lieu}. Obstacle poussé sur le côté, voie ouverte.',
    'Barricade écartée à la lame, secteur {lieu}. Chaussée libre, aucun blessé.',
    'Obstacle ôté, secteur {lieu}. La voie est dégagée, les unités peuvent passer.',
    'Barricade enlevée, secteur {lieu}. Débris repoussés sur le trottoir.',
  ]),

  // ── liaison, presse, densité ──
  lia('liaison_contact', { de: 'liaison', canal: 'commandement' }, [
    'Contact établi avec le service d\'ordre du cortège, secteur {lieu}. Ils acceptent le dialogue.',
    'Nous avons rejoint les organisateurs, secteur {lieu}. Discussion en cours sur le parcours.',
    'Les responsables du cortège sont avec nous, secteur {lieu}. Ils isolent déjà les éléments violents.',
  ]),
  lia('liaison_accord', { de: 'liaison', canal: 'commandement' }, [
    'Les organisateurs annoncent la dispersion dans {duree} minutes, sortie par {voie}.',
    'Accord obtenu : arrêt du cortège, secteur {lieu}. Dispersion annoncée dans {duree} minutes.',
    'Les organisateurs acceptent de changer de parcours : sortie par {voie}.',
  ]),
  lia('liaison_refus', { de: 'liaison', canal: 'commandement', prio: 2 }, [
    'Les organisateurs refusent de modifier le parcours, secteur {lieu}. Le cortège avance malgré l\'interdiction.',
    'Pas d\'accord possible, secteur {lieu}. Le service d\'ordre ne contrôle plus la tête de cortège.',
    'Dialogue rompu, secteur {lieu}. Le cortège continue vers {direction}.',
  ]),
  lia('presse_identifiee', { canal: 'commandement' }, [
    'Journalistes identifiés devant le cordon, secteur {lieu}. Effectif : {nombre}, ils demandent à passer. Je les laisse passer.',
    'Presse présente, secteur {lieu}. Effectif : {nombre}, brassards visibles, je les place derrière la ligne.',
    'Équipe de presse sur le secteur {lieu}. Effectif : {nombre}. Accès laissé libre, ils filment.',
  ]),
  lia('densite_critique', { prio: 2 }, [
    'URGENT. Densité critique devant le barrage, secteur {lieu}. Plus de quatre personnes au mètre carré, aucune issue ouverte.',
    'URGENT. Risque de compression, secteur {lieu}. Foule dense, je rouvre une issue côté {direction}.',
    'URGENT. Foule trop dense, secteur {lieu}. Compression en tête, je recule la ligne de {distance} mètres.',
  ]),
  lia('densite_normale', {}, [
    'Densité revenue à la normale, secteur {lieu}. Issues dégagées, plus aucun risque de compression.',
    'La foule se desserre, secteur {lieu}. Issue ouverte côté {direction}.',
    'Pression relâchée, secteur {lieu}. Plus de risque de bousculade.',
  ]),
  lia('bousculade', { prio: 2 }, [
    'URGENT. Mouvement de foule, secteur {lieu}. Bousculade grave, personnes au sol, je suspends toute manœuvre.',
    'URGENT. Panique dans la foule, secteur {lieu}. Plusieurs personnes tombent, je dégage les issues.',
    'URGENT. Bousculade, secteur {lieu}. Des blessés sont à craindre, je demande SANTÉ.',
  ]),

  // ── fin de mission ──
  fin('debut_mission', { de: 'commandant', a: 'tous', canal: 'commandement', fin: 'termine' }, [
    'Début de la mission à {heure}. Chacun à son poste, secteur {lieu}.',
    'Mission engagée à {heure}. Toutes les unités en position, secteur {lieu}.',
    'Prise de service du dispositif à {heure}, secteur {lieu}. Bonne mission à tous.',
  ]),
  fin('fin_mission', { canal: 'commandement' }, [
    'Fin de mission à {heure}, secteur {lieu}. Dispersion terminée, plus aucun trouble.',
    'Mission accomplie à {heure}. Le secteur {lieu} est libre, je prépare le retour.',
    'La manifestation est terminée, secteur {lieu}. Fin de mission à {heure}, effectif au complet.',
  ]),
  fin('bilan_force', { canal: 'commandement' }, [
    'Consommation : {nombre} lacrymogènes à main, {reste} au lanceur. Agents blessés : {indisponibles}. Interpellés : {interpelles}.',
    'Bilan de l\'emploi de la force : {nombre} grenades à main, {reste} au lanceur, blessés : {indisponibles}, interpellés : {interpelles}.',
    'Comptes rendus : {nombre} lacrymogènes à main, {reste} au lanceur. Pertes : {indisponibles}. Interpellations : {interpelles}.',
  ]),
  fin('retour_base', {}, [
    'Retour à la base, secteur {lieu}. Embarquement terminé, effectif au complet.',
    'Nous regagnons la caserne depuis le secteur {lieu}. Véhicules en colonne, mission terminée.',
    'Départ du secteur {lieu}, retour à la base. Matériel contrôlé, aucun oubli.',
    'En route pour la base. Compagnie en colonne, rapport à suivre.',
  ]),

  // ── ambiance (messages de faible priorité émis par le générateur) ──
  amb('ambiance_ras', { prio: 0 }, [
    'Rien à signaler, secteur {lieu}. Calme plat.',
    'Néant sur le secteur {lieu}. Les agents patientent.',
    'RAS, secteur {lieu}. Nous restons en attente.',
    'Situation calme, secteur {lieu}. Circulation normale aux abords.',
    'Pas de mouvement notable, secteur {lieu}. Les agents restent à leur poste.',
  ]),
  amb('ambiance_rassemblement', { prio: 0 }, [
    'Le rassemblement se constitue, secteur {lieu}. Premiers manifestants, banderoles déployées.',
    'Arrivées régulières, secteur {lieu}. Une foule s\'installe, ambiance détendue.',
    'Le cortège se forme, secteur {lieu}. Effectif en hausse, volume : {nombre}.',
    'Rassemblement en cours, secteur {lieu}. Sonorisation en place, prises de parole.',
    'Des groupes affluent encore, secteur {lieu}. Les organisateurs installent la tête de cortège.',
  ]),
  amb('ambiance_cortege', { prio: 0 }, [
    'Le cortège avance, secteur {lieu}. Volume : {nombre}, slogans scandés, rien d\'anormal.',
    'Cortège en marche, secteur {lieu}. Tête à l\'allure, ordre maintenu.',
    'Progression normale du cortège, secteur {lieu}. Aucun incident.',
    'Le cortège passe, secteur {lieu}. Ambiance tranquille, service d\'ordre visible.',
    'Cortège en bon ordre, secteur {lieu}. Les ballons et les drapeaux avancent sans heurt.',
  ]),
  amb('ambiance_vigilance', { prio: 0 }, [
    'Ambiance qui se tend un peu, secteur {lieu}. Je reste vigilant.',
    'Quelques éléments nerveux, secteur {lieu}. Je surveille la tête de cortège.',
    'Vigilance maintenue, secteur {lieu}. Les groupes se rapprochent de la ligne.',
    'Un peu d\'agitation, secteur {lieu}. Rien de grave pour l\'instant.',
    'Je garde un œil sur un groupe en retrait, secteur {lieu}. Rien d\'anormal pour le moment.',
  ]),
  amb('ambiance_tension', { prio: 0 }, [
    'Tension palpable, secteur {lieu}. Groupes déterminés devant la ligne.',
    'Climat tendu, secteur {lieu}. Les invectives se multiplient, la réserve est proche.',
    'Ça se durcit, secteur {lieu}. Premiers objets lancés, je maintiens la distance.',
    'Pression sur la ligne, secteur {lieu}. La foule nerveuse recule à peine.',
    'Les esprits s\'échauffent, secteur {lieu}. Je serre la ligne et je garde la réserve prête.',
  ]),
  amb('ambiance_affrontement', { prio: 0 }, [
    'Affrontements sur le secteur {lieu}. Les jets continuent, la ligne tient.',
    'Violences persistantes, secteur {lieu}. Fumée et projectiles, les agents tiennent la ligne.',
    'Ça frotte sur le secteur {lieu}. Jets en rafales, gaz en usage.',
    'Contact permanent avec les groupes violents, secteur {lieu}. Effectif encore apte : {nombre}.',
    'Heurts en continu sur le secteur {lieu}. Les agents tiennent malgré la fatigue.',
  ]),
  amb('ambiance_dispersion', { prio: 0 }, [
    'Dispersion en cours, secteur {lieu}. La foule s\'éclaircit, départs par les rues latérales.',
    'Les manifestants se dispersent, secteur {lieu}. Les groupes violents se fondent dans la foule.',
    'La place se vide, secteur {lieu}. Je garde la ligne et je surveille les départs.',
    'Reflux de la foule, secteur {lieu}. Effectif restant : {nombre}.',
    'Les derniers groupes s\'éloignent, secteur {lieu}. Je suis le mouvement à distance.',
  ]),
  amb('ambiance_apres', { prio: 0 }, [
    'Calme revenu, secteur {lieu}. Nettoyage de la chaussée en cours.',
    'Fin de manifestation, secteur {lieu}. Les unités reconnaissent les abords.',
    'Plus de manifestants visibles, secteur {lieu}. Reconnaissance des rues adjacentes.',
    'Dispositif en allégement, secteur {lieu}. Retour à la normale progressif.',
    'Chaussée presque libre, secteur {lieu}. Ramassage des débris et vérification des abords.',
  ]),
  amb('ambiance_logistique', { prio: 0 }, [
    'Eau distribuée aux agents, secteur {lieu}. La chaleur du casque se fait sentir.',
    'Point logistique, secteur {lieu}. Les fourgons assurent l\'eau et les masques de rechange.',
    'Les agents tiennent la ligne depuis un bon moment, secteur {lieu}. Je prévois une relève.',
    'Ravitaillement en vue aux véhicules, secteur {lieu}. Les munitions sont comptées.',
    'Fatigue qui s\'installe, secteur {lieu}. Je fais alterner les rangs à tour de rôle.',
  ]),
  amb('ambiance_circulation', { prio: 0 }, [
    'Circulation dense aux abords, secteur {lieu}. Les déviations tiennent.',
    'Bouchon en formation en amont du barrage, secteur {lieu}. Les automobilistes font demi-tour.',
    'Des véhicules cherchent encore à passer, secteur {lieu}. Les agents de carrefour les redirigent.',
    'Bus déviés, secteur {lieu}. La circulation reste fluide sur les itinéraires de délestage.',
    'Les rues adjacentes se remplissent de voitures, secteur {lieu}. Rien d\'anormal.',
  ]),
  amb('ambiance_slogans', { prio: 0 }, [
    'Slogans repris en chœur, secteur {lieu}. Banderoles lisibles, ambiance bon enfant.',
    'Musique et sono en tête de cortège, secteur {lieu}. Les participants chantent.',
    'Cortège revendicatif mais calme, secteur {lieu}. Pancartes et ballons levés.',
    'Prises de parole au porte-voix, secteur {lieu}. La foule écoute et applaudit.',
    'Familles et groupes d\'étudiants mêlés, secteur {lieu}. Aucun geste hostile envers les unités.',
  ]),
  amb('ambiance_foyers', { prio: 0 }, [
    'Fumée noire au loin, secteur {lieu}. Un feu de mobilier urbain est probable.',
    'Foyer de poubelles enflammées, secteur {lieu}. Il ne s\'étend pas pour l\'instant.',
    'Odeur de gaz sur le secteur {lieu}. Le vent pousse les nuages vers les rues latérales.',
    'Des débris jonchent la chaussée, secteur {lieu}. Les feux sont surveillés.',
    'Étincelles et fumée épaisse, secteur {lieu}. Je signale le foyer et je garde la distance.',
  ]),
  amb('ambiance_secours_veille', { prio: 0 }, [
    'Dispositif de secours en veille à proximité, secteur {lieu}. Ambulance prête à intervenir.',
    'Les pompiers sont en alerte au point de rassemblement, secteur {lieu}.',
    'Équipe médicale en place derrière la ligne, secteur {lieu}. Aucun appel pour l\'instant.',
    'Couloir de secours maintenu libre, secteur {lieu}. Les véhicules attendent un appel.',
    'Point sanitaire installé, secteur {lieu}. Quelques malaises légers pris en charge.',
  ]),
  amb('ambiance_presse', { prio: 0 }, [
    'Nombreux journalistes et téléphones levés, secteur {lieu}. Tout est filmé.',
    'Équipes de presse massées derrière le cordon, secteur {lieu}. Elles filment la ligne.',
    'Caméras sur toute la ligne, secteur {lieu}. Les agents ont consigne de rester irréprochables.',
    'Des journalistes demandent des précisions, secteur {lieu}. Je les renvoie vers le point presse.',
    'Photographes en nombre, secteur {lieu}. Ils restent derrière le cordon.',
  ]),
  amb('ambiance_effectif', { prio: 0 }, [
    'Point d\'effectif, secteur {lieu} : {nombre} agents disponibles, tout le monde est apte.',
    'Effectif présent : {nombre}, secteur {lieu}. Aucun manquant à signaler.',
    'Vérification de l\'effectif : {nombre} agents en place, secteur {lieu}.',
    'Effectif au complet, secteur {lieu}. Agents disponibles : {nombre}.',
    'Tout le monde est à son poste, secteur {lieu} : {nombre} agents, aucun manquant.',
  ]),
  amb('ambiance_heure', { de: 'central', a: 'tous', canal: 'commandement', prio: 0, fin: 'termine' }, [
    'Il est {heure}. Point horaire, rien de particulier à signaler.',
    'Point de situation à {heure}. Toutes les unités sont priées de rester à l\'écoute.',
    'Heure : {heure}. Tenez vos positions et rendez compte de tout fait notable.',
    'À {heure}, la salle de commandement vous rappelle de rester attentifs sur le réseau.',
    'Rappel horaire : {heure}. Maintenez l\'écoute et signalez tout fait nouveau.',
  ]),
  amb('ambiance_meteo', { prio: 0 }, [
    'Conditions : {meteo}, secteur {lieu}. Les agents s\'adaptent.',
    'Météo sur le secteur {lieu} : {meteo}. Sans incidence sur le dispositif.',
    'Temps {meteo}, secteur {lieu}. Les équipements sont ajustés.',
    'Sur le secteur {lieu}, le temps est {meteo}. Les agents ajustent tenue et équipement.',
    'Conditions {meteo}, secteur {lieu}. Aucune gêne particulière pour le dispositif.',
  ]),
];
