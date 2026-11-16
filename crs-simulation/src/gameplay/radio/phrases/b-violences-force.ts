/* Radio — violences, agents, renforts et logistique, sommations et emploi de la force. */

import { group } from './define';
import type { PhraseDef } from './define';

const vio = group('Violences et jets');
const age = group('Agents et blessés');
const log = group('Renforts, munitions et relèves');
const dro = group('Sommations et emploi de la force');

export const PHRASES_VIOLENCES_FORCE: readonly PhraseDef[] = [
  // ── violences et jets ──
  vio('jets_projectiles', { prio: 2 }, [
    'Jets de projectiles sur la ligne, secteur {lieu}. Bouteilles et pavés depuis la foule, refus de reculer.',
    'Je suis pris à partie, secteur {lieu}. Jets de projectiles en nombre, la ligne tient face {direction}.',
    'Pluie de projectiles sur le barrage, secteur {lieu}. Dégradations en cours, je demande les instructions.',
    'Projectiles sur les boucliers, secteur {lieu}. Violences caractérisées en tête de cortège.',
  ]),
  vio('jets_mortiers', { prio: 2 }, [
    'Tirs de mortiers d\'artifice sur la ligne, secteur {lieu}. Tir tendu depuis la foule, je mets en protection.',
    'Mortiers d\'artifice sur mon dispositif, secteur {lieu}. Plusieurs tirs tendus, boucliers levés.',
    'Feux d\'artifice tirés à hauteur d\'homme, secteur {lieu}. Les agents se couvrent, je demande votre appui.',
  ]),
  vio('jets_incendiaires', { prio: 2 }, [
    'Engins incendiaires lancés sur la ligne, secteur {lieu}. Flammes sur la chaussée, je m\'écarte et j\'éteins.',
    'Bouteilles incendiaires sur mon dispositif, secteur {lieu}. Foyers au sol devant les boucliers.',
    'Jets d\'engins enflammés, secteur {lieu}. Je passe en tortue et je demande l\'extinction.',
  ]),
  vio('jets_cesses', {}, [
    'Les jets ont cessé, secteur {lieu}. La foule recule d\'une trentaine de mètres.',
    'Plus de projectiles depuis quelques instants, secteur {lieu}. Je garde la ligne.',
    'Accalmie, secteur {lieu}. Les jets se sont arrêtés, groupes violents repliés dans la foule.',
  ]),
  vio('assaut_ligne', { prio: 2 }, [
    'Assaut sur la ligne, secteur {lieu}. Groupe organisé de {nombre} personnes au contact, coups et jets.',
    'Attaque coordonnée contre le barrage, secteur {lieu}. Effectif : {nombre}, ils cherchent à percer.',
    'Charge de manifestants violents sur ma ligne, secteur {lieu}. Effectif : {nombre}, la ligne recule d\'un pas.',
  ]),
  vio('violences_unite', { prio: 2 }, [
    'Violences sur l\'unité, secteur {lieu}. J\'emploie la force d\'initiative, cadre violences et voies de fait. Avertissement fait à la foule.',
    'Agressés par un groupe, secteur {lieu}. Riposte d\'initiative, strictement proportionnée.',
    'Attaque sur mes agents, secteur {lieu}. Je réponds d\'initiative, cadre légitime défense de l\'unité.',
  ]),
  vio('retour_gaz', { prio: 2 }, [
    'Retour de gaz sur la ligne, secteur {lieu}. Vent de face, je suspends les tirs et je fais mettre les masques.',
    'Le vent rabat le gaz sur mon dispositif, secteur {lieu}. Masques mis, je cesse les tirs.',
    'Nuage de lacrymogènes ramené sur les agents, secteur {lieu}. Je décale la ligne de {distance} mètres.',
  ]),
  vio('degradations', {}, [
    'Dégradations en cours, secteur {lieu}. Vitrines brisées, groupe de {nombre} personnes.',
    'Vitrines brisées au marteau, secteur {lieu}. Rideaux de fer forcés, effectif : {nombre}.',
    'Casse en cours, secteur {lieu}. Mobilier urbain détruit, banque visée, effectif : {nombre}.',
    'Boutiques attaquées, secteur {lieu}. Dégradations et début de pillage, effectif : {nombre}.',
  ]),

  // ── agents et blessés ──
  age('agent_blesse', { prio: 2 }, [
    'URGENT. Un agent blessé, secteur {lieu}. Gravité : {gravite}. Il est pris en charge à l\'arrière de la ligne.',
    'URGENT. Agent blessé, secteur {lieu}. Gravité : {gravite}. Je le sors de la ligne.',
    'URGENT. Blessure d\'un agent, secteur {lieu}. Gravité : {gravite}. Besoin d\'un relais pour le soigner.',
  ]),
  age('agent_a_terre', { prio: 2 }, [
    'URGENT. Agent à terre, secteur {lieu}. Il est encerclé par la foule, je lance le dégagement.',
    'URGENT. Un de mes agents est au sol, secteur {lieu}. Il ne se relève pas, j\'engage un groupe pour l\'extraire.',
    'URGENT. Homme à terre, secteur {lieu}. Il a perdu son bouclier, je demande un appui pour le récupérer.',
    'URGENT. Agent à terre, secteur {lieu}. Je protège et j\'envoie le secouriste.',
  ]),
  age('agent_degage', {}, [
    'Agent dégagé, secteur {lieu}. Pris en charge par le secouriste, état : {gravite}.',
    'L\'agent a été extrait, secteur {lieu}. Il est à l\'abri derrière la ligne, état : {gravite}.',
    'Agent récupéré, secteur {lieu}. Évacuation vers le véhicule, état : {gravite}.',
  ]),
  age('agent_isole', { prio: 2 }, [
    'URGENT. Agent isolé, secteur {lieu}. Coupé de son groupe, pris à partie par la foule.',
    'URGENT. Un agent a perdu le contact avec sa section, secteur {lieu}. Il est menacé, j\'envoie un binôme.',
    'URGENT. Policier isolé, secteur {lieu}. Il se replie seul, besoin d\'un appui immédiat.',
  ]),
  age('civil_blesse', { prio: 2 }, [
    'URGENT. Un manifestant blessé, secteur {lieu}. Gravité : {gravite}. Je sécurise et je demande les secours.',
    'URGENT. Personne blessée dans la foule, secteur {lieu}. Gravité : {gravite}. Je dégage un accès.',
    'URGENT. Civil au sol, secteur {lieu}. Gravité : {gravite}. Je demande SANTÉ sur place.',
  ]),
  age('bilan_effectif', {}, [
    'Point d\'effectif : {nombre} agents disponibles, hors de combat : {indisponibles}.',
    'Effectif disponible : {nombre}. Indisponibles : {indisponibles}. Je maintiens le dispositif.',
    'Situation de l\'effectif : disponibles {nombre}, blessés ou évacués : {indisponibles}.',
  ]),

  // ── renforts, munitions, relèves ──
  log('demande_renfort', { prio: 2 }, [
    'URGENT. Je demande du renfort, secteur {lieu}. Ligne sous pression, besoin de {nombre} agents supplémentaires.',
    'URGENT. Renfort demandé, secteur {lieu}. Je ne tiendrai pas seul, effectif demandé : {nombre}.',
    'URGENT. Demande d\'appui immédiate, secteur {lieu}. La ligne fléchit face {direction}.',
    'URGENT. Il me faut des renforts, secteur {lieu}. Débordé par le nombre, effectif demandé : {nombre}.',
  ]),
  log('renfort_accorde', { de: 'central', a: 'unite', canal: 'commandement', fin: 'termine' }, [
    'Renfort accordé : {cible} est en route vers le secteur {lieu}.',
    '{cible} vous rejoint, secteur {lieu}. Arrivée dans quelques minutes.',
    'Je vous envoie {cible} en renfort, secteur {lieu}. Tenez jusque-là.',
  ]),
  log('renfort_arrive', {}, [
    'Renfort arrivé, secteur {lieu}. Je l\'intègre à la ligne.',
    '{cible} est sur place, secteur {lieu}. Je le place à droite du dispositif.',
    'Le renfort a rejoint la position, secteur {lieu}. Ligne consolidée.',
  ]),
  log('munitions_basses', {}, [
    'Munitions basses : lacrymogènes à {pct} pour cent. Réapprovisionnement à prévoir.',
    'Dotation en grenades lacrymogènes à {pct} pour cent. Je ménage mes tirs.',
    'Je suis juste en munitions : il reste {reste} grenades. Je demande un ravitaillement.',
    'Stock de grenades en baisse, il reste {reste} grenades. Je passe en tirs économes.',
  ]),
  log('munitions_epuisees', { prio: 2 }, [
    'URGENT. Plus de grenades lacrymogènes. Je demande un ravitaillement immédiat, secteur {lieu}.',
    'URGENT. Dotation épuisée, secteur {lieu}. Je ne peux plus tirer, ravitaillement nécessaire.',
    'URGENT. Plus aucune munition de maintien de l\'ordre, secteur {lieu}. Je me replie sur le véhicule.',
  ]),
  log('ravitaillement_demande', {}, [
    'Demande de ravitaillement : grenades, eau et masques, secteur {lieu}.',
    'Je demande un ravitaillement au point des fourgons : munitions et eau pour les agents.',
    'Besoin de ravitaillement, secteur {lieu}. Priorité aux munitions.',
  ]),
  log('ravitaillement_effectue', {}, [
    'Ravitaillement effectué, secteur {lieu}. Dotation de nouveau complète.',
    'Munitions reçues, secteur {lieu}. Dotation reconstituée, eau distribuée aux agents.',
    'Réapprovisionnement terminé aux fourgons. Prêt à reprendre la ligne.',
  ]),
  log('releve_demande', {}, [
    'Demande de relève, secteur {lieu}. La section tient la ligne depuis trop longtemps, fatigue marquée.',
    'Section épuisée, secteur {lieu}. Je demande à être relevé, effectif encore apte : {nombre}.',
    'Je sollicite une relève, secteur {lieu}. Agents à bout de forces, hydratation nécessaire.',
    'Besoin d\'une relève, secteur {lieu}. Fatigue importante, plusieurs agents à bout.',
  ]),
  log('releve_ordonnee', { de: 'commandant', a: 'cible', canal: 'unite' }, [
    'Relevez {unite} sur place, secteur {lieu}. Passage de ligne.',
    'Vous relevez {unite}, secteur {lieu}. Alignez-vous derrière eux à dix mètres, passage de ligne sur mon ordre.',
    'Relève de {unite} par vos soins, secteur {lieu}. Prenez le relais de la ligne.',
  ]),
  log('releve_en_cours', {}, [
    'Relève en cours, secteur {lieu}. Passage de ligne, {unite} se replie vers les véhicules.',
    'Passage de ligne en cours, secteur {lieu}. La section fraîche prend la place.',
    'Relève engagée, secteur {lieu}. Les agents fatigués rompent par échelons.',
  ]),
  log('releve_effectuee', {}, [
    'Relève effectuée, secteur {lieu}. La section relevée récupère aux véhicules.',
    'Ligne relevée, secteur {lieu}. Nous tenons la position, les agents fatigués se reposent.',
    'Relève terminée, secteur {lieu}. Nouvelle ligne en place face {direction}.',
  ]),

  // ── sommations et emploi de la force ──
  dro('sommation_annonce', { de: 'commandant', prio: 2, canal: 'commandement' }, [
    'Je constate l\'attroupement, secteur {lieu}, et je procède à l\'annonce. Aucun emploi de la force avant mon ordre.',
    'Annonce faite à la foule, secteur {lieu}. Obéissance à la loi, dispersion demandée. Pas d\'emploi de la force avant mon ordre.',
    'Je procède à l\'annonce, secteur {lieu}. L\'attroupement est constaté, la dispersion est demandée.',
  ]),
  dro('sommation_premiere', { de: 'commandant', prio: 2, canal: 'commandement' }, [
    'Première sommation faite à {heure}, secteur {lieu}. Issue ouverte : {voie}.',
    'Première sommation prononcée à {heure}. Issue laissée libre : {voie}.',
    'Première sommation effectuée à {heure}, secteur {lieu}. Les manifestants peuvent quitter les lieux par {voie}.',
  ]),
  dro('sommation_derniere', { de: 'commandant', prio: 2, canal: 'commandement' }, [
    'Dernière sommation faite à {heure}, secteur {lieu}. Issue ouverte : {voie}. Emploi de la force possible à l\'issue du délai.',
    'Dernière sommation prononcée à {heure}. Issue libre : {voie}. Je préviens les unités : la force peut suivre.',
    'Dernière sommation effectuée à {heure}, secteur {lieu}. Délai laissé à la foule, issue ouverte : {voie}.',
  ]),
  dro('sommations_effectuees', { de: 'commandant', prio: 2, canal: 'commandement', fin: 'termine' }, [
    'Sommations effectuées, secteur {lieu}. Annonce, première et dernière sommation faites, issue ouverte : {voie}.',
    'Les trois étapes des sommations sont accomplies, secteur {lieu}. Je suis en mesure d\'autoriser la force.',
    'Cycle de sommations terminé à {heure}, secteur {lieu}. Aucun départ massif, la foule reste en place.',
  ]),
  dro('force_niveau_0', { de: 'commandant', a: 'cible', prio: 2, fin: 'termine' }, [
    'Aucun emploi de la force. Gardez la distance, pas de contact, pas de tir.',
    'Interdiction de toute force. Tenez la position, vous ne ripostez pas sans mon ordre.',
    'Niveau de force : néant. Maintien à distance seulement, secteur {lieu}.',
  ]),
  dro('force_niveau_1', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : présence et contact seulement. Refoulement au bouclier, limite : {limite}. Faites l\'aperçu.',
    'Niveau un autorisé : poussée au bouclier et maîtrise à mains nues. Limite : {limite}. Faites l\'aperçu.',
    'Vous pouvez refouler au contact, secteur {lieu}. Pas de moyen intermédiaire, limite : {limite}. Faites l\'aperçu.',
  ]),
  dro('force_niveau_2', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : bâton de défense et gazeuse à main. Limite : {limite}. Faites l\'aperçu.',
    'Niveau deux autorisé : bâton et gazeuse, secteur {lieu}. Limite : {limite}. Faites l\'aperçu.',
    'Autorisation donnée jusqu\'au bâton et à la gazeuse à main, limite : {limite}. Faites l\'aperçu.',
  ]),
  dro('force_niveau_3', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : lacrymogènes à main et au lanceur, canon à eau. Limite : {limite}. Faites l\'aperçu.',
    'Niveau trois autorisé : grenades lacrymogènes, tirs courbes sur ordre. Limite : {limite}. Faites l\'aperçu.',
    'Gaz et jets d\'eau autorisés, secteur {lieu}. Limite : {limite}. Faites l\'aperçu.',
  ]),
  dro('force_niveau_4', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Usage des armes autorisé : grenades de désencerclement et lanceur de balles de défense, objectif désigné. Limite : {limite}. Collationnez.',
    'Niveau quatre autorisé, secteur {lieu} : désencerclement et lanceur de balles de défense, uniquement sur désignation. Limite : {limite}. Collationnez.',
    'Armes intermédiaires autorisées sur objectif désigné, limite : {limite}. Collationnez.',
  ]),
  dro('force_niveau_5', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Légitime défense seule : arme de service autorisée uniquement contre une menace vitale et immédiate. Collationnez.',
    'Niveau cinq : arme à feu réservée à la légitime défense, contre une menace de mort immédiate, secteur {lieu}. Collationnez.',
    'Arme de service autorisée en dernier recours, légitime défense strictement. Collationnez.',
  ]),
  dro('force_apercu', { a: 'commandant', canal: 'commandement', fin: 'termine' }, [
    'Aperçu. Je collationne : emploi de la force autorisé, limite : {limite}.',
    'Reçu et aperçu. Autorisation collationnée, limite : {limite}.',
    'Aperçu, ordre bien reçu. J\'applique dans la limite : {limite}.',
  ]),
  dro('force_suspendue', { de: 'commandant', a: 'tous', canal: 'commandement', prio: 2, fin: 'termine' }, [
    'Halte à l\'emploi de la force : le trouble a cessé. Reprise de la posture de contact.',
    'Cessez l\'emploi de la force, secteur {lieu}. Maintenez la position sans riposter.',
    'Suspension de l\'emploi de la force, effective immédiatement. Compte rendu à la fin du mouvement.',
  ]),
];
