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
    'Jets de projectiles sur la ligne, secteur {lieu}. Je tiens face {direction}.',
    'Je suis pris à partie, secteur {lieu}. Jets de projectiles, la ligne tient face {direction}.',
    'Projectiles sur le dispositif, secteur {lieu}. Boucliers levés, je tiens face {direction}.',
    'Jets sur les boucliers, secteur {lieu}. Violences contre l\'unité, je tiens face {direction}.',
  ]),
  vio('jets_mortiers', { prio: 2 }, [
    'Tirs de mortiers d\'artifice sur la ligne, secteur {lieu}. Tirs tendus, les agents se couvrent derrière les boucliers.',
    'Mortiers d\'artifice sur mon dispositif, secteur {lieu}. Tirs tendus, boucliers levés.',
    'Artifices tirés à hauteur d\'homme sur la ligne, secteur {lieu}. Je mets les agents à couvert derrière les boucliers.',
  ]),
  vio('jets_incendiaires', { prio: 2 }, [
    'Engins incendiaires lancés sur la ligne, secteur {lieu}. Flammes au sol devant les boucliers, je fais éteindre.',
    'Bouteilles incendiaires sur mon dispositif, secteur {lieu}. Foyers au sol, porte-extincteur engagé.',
    'Jets d\'engins enflammés sur la ligne, secteur {lieu}. Feu sur la chaussée, extinction en cours.',
  ]),
  vio('jets_cesses', {}, [
    'Les jets ont cessé, secteur {lieu}. Je garde la ligne.',
    'Plus de projectiles, secteur {lieu}. Je maintiens le dispositif.',
    'Accalmie, secteur {lieu}. Les jets se sont arrêtés, je reste en position.',
  ]),
  vio('assaut_ligne', { prio: 2 }, [
    'URGENT. Assaut sur la ligne, secteur {lieu}. Groupe organisé au contact, effectif : {nombre}.',
    'URGENT. Attaque coordonnée contre la ligne, secteur {lieu}. Le groupe cherche à percer, effectif : {nombre}.',
    'URGENT. Charge de manifestants violents sur ma ligne, secteur {lieu}. Contact sur les boucliers, effectif du groupe : {nombre}.',
  ]),
  vio('violences_unite', { prio: 2 }, [
    'Violences sur l\'unité, secteur {lieu}. J\'emploie la force d\'initiative, cadre violences et voies de fait. Avertissement fait à la foule.',
    'Unité prise à partie, secteur {lieu}. Riposte d\'initiative et proportionnée, cadre violences et voies de fait. Avertissement fait à la foule.',
    'Violences et voies de fait contre mes agents, secteur {lieu}. Je riposte d\'initiative, après avertissement à la foule.',
  ]),
  vio('retour_gaz', { prio: 2 }, [
    'Retour de gaz sur la ligne, secteur {lieu}. Vent de face, je suspends les tirs et je fais mettre les masques.',
    'Le vent rabat le gaz sur mon dispositif, secteur {lieu}. Masques mis, tirs suspendus.',
    'Nuage de lacrymogènes ramené sur les agents par le vent, secteur {lieu}. Je fais mettre les masques et je suspends les tirs.',
  ]),
  vio('degradations', {}, [
    'Dégradations en cours, secteur {lieu}. Vitrines brisées, effectif du groupe : {nombre}.',
    'Vitrines attaquées, secteur {lieu}. Dégradations en cours, effectif du groupe : {nombre}.',
    'Casse en cours, secteur {lieu}. Vitrines et mobilier urbain visés, effectif du groupe : {nombre}.',
    'Commerces pris pour cible, secteur {lieu}. Vitrines brisées, effectif du groupe : {nombre}.',
  ]),

  // ── agents et blessés ──
  age('agent_blesse', { prio: 2 }, [
    'URGENT. Un agent blessé, secteur {lieu}. Gravité : {gravite}. Je le fais sortir de la ligne.',
    'URGENT. Agent blessé, secteur {lieu}. Gravité : {gravite}. Il est conduit à l\'arrière de la ligne.',
    'URGENT. Blessure d\'un agent, secteur {lieu}. Gravité : {gravite}. Je le fais prendre en charge à l\'arrière de la ligne.',
  ]),
  age('agent_a_terre', { prio: 2 }, [
    'URGENT. Agent à terre, secteur {lieu}. Je lance le dégagement.',
    'URGENT. Un de mes agents est au sol, secteur {lieu}. J\'engage un groupe pour l\'extraire.',
    'URGENT. Agent à terre devant la ligne, secteur {lieu}. Deux boucliers le couvrent, je le fais tirer à l\'arrière.',
    'URGENT. Agent au sol, secteur {lieu}. Je le protège et je le dégage.',
  ]),
  age('agent_degage', {}, [
    'Agent dégagé, secteur {lieu}. Il est à l\'abri derrière la ligne. Gravité : {gravite}.',
    'L\'agent a été extrait, secteur {lieu}. Il est en sécurité à l\'arrière. Gravité : {gravite}.',
    'Agent récupéré, secteur {lieu}. Il est à l\'arrière de la ligne. Gravité : {gravite}.',
  ]),
  age('agent_isole', { prio: 2 }, [
    'URGENT. Agent isolé, secteur {lieu}. Coupé de son groupe, je l\'envoie chercher.',
    'URGENT. Un agent a perdu le contact avec son groupe, secteur {lieu}. J\'engage un binôme pour le récupérer.',
    'URGENT. Agent séparé de la ligne, secteur {lieu}. Il est seul face à la foule, je le fais rejoindre.',
  ]),
  age('civil_blesse', { prio: 2 }, [
    'URGENT. Un manifestant blessé, secteur {lieu}. Gravité : {gravite}. Demande SANTÉ sur place, je sécurise.',
    'URGENT. Personne blessée dans la foule, secteur {lieu}. Gravité : {gravite}. Je sécurise et je demande SANTÉ.',
    'URGENT. Blessé civil au sol, secteur {lieu}. Gravité : {gravite}. Je demande SANTÉ sur place et je protège la victime.',
  ]),
  age('bilan_effectif', {}, [
    'Point d\'effectif. Nombre d\'agents disponibles : {nombre}. Hors de combat : {indisponibles}.',
    'Effectif. Nombre d\'agents disponibles : {nombre}. Indisponibles : {indisponibles}.',
    'Situation de l\'effectif. Nombre d\'agents en ligne : {nombre}. Blessés ou évacués : {indisponibles}.',
  ]),

  // ── renforts, munitions, relèves ──
  log('demande_renfort', { prio: 2 }, [
    'URGENT. Demande renfort, secteur {lieu}. Ligne sous pression, effectif demandé : {nombre}.',
    'URGENT. Renfort demandé, secteur {lieu}. Je ne tiendrai pas seul, effectif demandé : {nombre}.',
    'URGENT. Demande d\'appui immédiate, secteur {lieu}. La ligne fléchit, effectif demandé : {nombre}.',
    'URGENT. Il me faut du renfort, secteur {lieu}. Débordé par le nombre, effectif demandé : {nombre}.',
  ]),
  log('renfort_accorde', { de: 'central', a: 'unite', fin: 'termine', reponse: true }, [
    'Renfort accordé : {renfort} vous rejoint, secteur {lieu}. Délai : {duree} minutes.',
    '{renfort} vous rejoint en renfort, secteur {lieu}. Délai : {duree} minutes.',
    'Je vous envoie {renfort} en renfort, secteur {lieu}. Délai : {duree} minutes, tenez jusque-là.',
  ]),
  log('renfort_refuse', { de: 'central', a: 'unite', fin: 'termine', reponse: true }, [
    'NÉGATIF. Aucun renfort disponible pour le moment. Tenez avec vos moyens.',
    'NÉGATIF pour le renfort : toutes les unités sont engagées. Je vous rappelle dès qu\'un moyen se libère.',
    'NÉGATIF. Renfort indisponible pour l\'instant, tenez votre position. Je vous rappelle.',
  ]),
  log('renfort_arrive', {}, [
    'Renfort arrivé, secteur {lieu}. Je l\'intègre au dispositif.',
    'Le renfort a rejoint ma position, secteur {lieu}. Dispositif consolidé.',
    'Renfort sur place, secteur {lieu}. Il prend place dans le dispositif.',
  ]),
  log('munitions_basses', {}, [
    'Munitions basses : grenades lacrymogènes à {pct} pour cent. Réapprovisionnement à prévoir.',
    'Dotation en grenades lacrymogènes à {pct} pour cent. Ravitaillement à prévoir aux fourgons.',
    'Stock de grenades lacrymogènes en baisse : {pct} pour cent de la dotation. Je demande un ravitaillement.',
  ]),
  log('munitions_epuisees', { prio: 2 }, [
    'URGENT. Plus de grenades lacrymogènes, secteur {lieu}. Je demande un ravitaillement immédiat.',
    'URGENT. Dotation en grenades épuisée, secteur {lieu}. Ravitaillement immédiat nécessaire.',
    'URGENT. Plus aucune grenade, secteur {lieu}. Je tiens au bouclier en attendant le ravitaillement.',
  ]),
  log('ravitaillement_demande', {}, [
    'Demande de ravitaillement, secteur {lieu} : grenades et eau pour les agents.',
    'Je demande un ravitaillement aux fourgons, secteur {lieu} : munitions et eau.',
    'Besoin de ravitaillement, secteur {lieu}. Grenades en priorité, puis eau pour les agents.',
  ]),
  log('ravitaillement_ordonne', { de: 'commandant', a: 'cible' }, [
    'Ravitaillez-vous aux fourgons, un groupe après l\'autre. La ligne reste tenue pendant le mouvement.',
    'Ravitaillement aux véhicules, par groupes successifs. Vous gardez la ligne.',
    'Envoyez vos groupes se ravitailler aux fourgons à tour de rôle, sans dégarnir la ligne.',
  ]),
  log('ravitaillement_effectue', {}, [
    'Ravitaillement effectué, secteur {lieu}. Dotation de nouveau complète.',
    'Munitions perçues aux fourgons, secteur {lieu}. Dotation complète.',
    'Réapprovisionnement terminé, secteur {lieu}. Dotation reconstituée, prêt à reprendre la ligne.',
  ]),
  log('releve_demande', {}, [
    'Demande de relève, secteur {lieu}. Fatigue marquée, nombre d\'agents encore aptes : {nombre}.',
    'Unité épuisée, secteur {lieu}. Je demande à être relevé, nombre d\'agents encore aptes : {nombre}.',
    'Je sollicite une relève, secteur {lieu}. Agents à bout de forces, nombre encore apte à tenir : {nombre}.',
    'Besoin d\'une relève, secteur {lieu}. La ligne tient depuis trop longtemps, nombre d\'agents encore aptes : {nombre}.',
  ]),
  log('releve_ordonnee', { de: 'commandant', a: 'cible' }, [
    'Relevez {autre} sur place, secteur {lieu}. Passage de ligne.',
    'Vous relevez {autre}, secteur {lieu}. Alignez-vous à dix mètres derrière, passage de ligne sur mon ordre.',
    'Relève de {autre} par vos soins, secteur {lieu}. Passage de ligne, puis vous tenez la position.',
  ]),
  log('releve_en_cours', {}, [
    'Relève en cours, secteur {lieu}. Passage de ligne.',
    'Passage de ligne en cours, secteur {lieu}. L\'unité relevée se replie vers les véhicules.',
    'Relève engagée, secteur {lieu}. Passage de ligne, les agents relevés rejoignent les fourgons.',
  ]),
  log('releve_effectuee', {}, [
    'Relève effectuée, secteur {lieu}. Je tiens la ligne face {direction}, l\'unité relevée récupère aux véhicules.',
    'Ligne relevée, secteur {lieu}. Je tiens la position face {direction}.',
    'Relève terminée, secteur {lieu}. Nouvelle ligne en place face {direction}.',
  ]),

  // ── sommations et emploi de la force (le commandant est l'autorité habilitée : il somme et il décide) ──
  dro('sommation_annonce', { de: 'commandant', a: 'tous', prio: 2, fin: 'termine' }, [
    'Je constate l\'attroupement, secteur {lieu}, et je procède à l\'annonce. Aucun emploi de la force avant mon ordre.',
    'Attroupement constaté, secteur {lieu}. Je fais l\'annonce au haut-parleur. Aucun emploi de la force avant mon ordre.',
    'Je procède à l\'annonce, secteur {lieu} : l\'attroupement est constaté. Pas d\'emploi de la force sans mon ordre.',
  ]),
  dro('sommation_premiere', { de: 'commandant', prio: 2, fin: 'termine' }, [
    'Première sommation faite à {heure}, secteur {lieu}. Issue ouverte : {issue}.',
    'Première sommation prononcée à {heure}, secteur {lieu}. Issue laissée libre : {issue}.',
    'Première sommation effectuée à {heure}, secteur {lieu}. Issue ouverte à la foule : {issue}.',
  ]),
  dro('sommation_derniere', { de: 'commandant', prio: 2, fin: 'termine' }, [
    'Dernière sommation faite à {heure}, secteur {lieu}. Issue ouverte : {issue}.',
    'Dernière sommation prononcée à {heure}, secteur {lieu}. Issue laissée libre : {issue}.',
    'Dernière sommation effectuée à {heure}, secteur {lieu}. Issue ouverte à la foule : {issue}.',
  ]),
  dro('sommation_reiteree', { de: 'commandant', prio: 2, fin: 'termine' }, [
    'Dernière sommation réitérée à {heure}, secteur {lieu}, avant l\'usage des armes. Issue ouverte : {issue}.',
    'Je réitère la dernière sommation à {heure}, secteur {lieu}, avant l\'usage des armes. Issue ouverte : {issue}.',
    'Réitération de la dernière sommation faite à {heure}, secteur {lieu}, préalable à l\'usage des armes. Issue laissée libre : {issue}.',
  ]),
  dro('sommation_fusee_rouge', { de: 'commandant', prio: 2, fin: 'termine' }, [
    'Fusée rouge tirée à {heure}, secteur {lieu}, en complément de la sommation.',
    'Sommation doublée d\'une fusée rouge à {heure}, secteur {lieu}.',
    'Fusée rouge lancée à {heure}, secteur {lieu} : elle complète la sommation faite au haut-parleur.',
  ]),
  dro('sommations_effectuees', { de: 'commandant', prio: 2, fin: 'termine' }, [
    'Sommations effectuées, secteur {lieu}. Annonce, première et dernière sommation faites. Issue ouverte : {issue}.',
    'Annonce et sommations faites, secteur {lieu}, la dernière à {heure}. Issue ouverte : {issue}.',
    'Les sommations sont accomplies, secteur {lieu} : annonce, première, puis dernière sommation. Issue laissée libre : {issue}.',
  ]),
  dro('force_niveau_0', { de: 'commandant', a: 'cible', prio: 2, fin: 'termine' }, [
    'Aucun emploi de la force. Présence et barrage statique seulement, distance conservée avec la foule.',
    'Emploi de la force interdit. Tenez la position sans contact et sans tir.',
    'Pas d\'emploi de la force. Maintien à distance, aucun contact, aucun tir.',
  ]),
  dro('force_niveau_1', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : refoulement au bouclier, sans bâton ni gaz. Limite : {limite}. FAITES L\'APERÇU.',
    'Emploi de la force autorisé, au contact seulement : poussée au bouclier et maîtrise à mains nues. Limite : {limite}. FAITES L\'APERÇU.',
    'Vous pouvez refouler au bouclier, sans bâton ni gaz. Limite : {limite}. FAITES L\'APERÇU.',
  ]),
  dro('force_niveau_2', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : bâton de défense et aérosol lacrymogène, aucune grenade. Limite : {limite}. FAITES L\'APERÇU.',
    'Emploi de la force autorisé jusqu\'au bâton et à la gazeuse à main, pas de grenade. Limite : {limite}. FAITES L\'APERÇU.',
    'Bâton de défense et gazeuse à main autorisés, aucune grenade. Limite : {limite}. FAITES L\'APERÇU.',
  ]),
  dro('force_niveau_3', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Emploi de la force autorisé : grenades lacrymogènes et canon à eau. Lanceurs en tir courbe seulement. Limite : {limite}. FAITES L\'APERÇU.',
    'Emploi de la force autorisé jusqu\'aux lacrymogènes, à main et au lanceur en tir courbe, et au canon à eau. Limite : {limite}. FAITES L\'APERÇU.',
    'Lacrymogènes et canon à eau autorisés. Lanceurs en tir courbe, tir tendu interdit. Limite : {limite}. FAITES L\'APERÇU.',
  ]),
  dro('force_niveau_4', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Usage des armes autorisé : grenades assourdissantes et de désencerclement. Lanceur de balles de défense en riposte seulement, sur objectif désigné. Limite : {limite}. COLLATIONNEZ.',
    'Usage des armes autorisé : grenades assourdissantes au lanceur, désencerclement au ras du sol. Balles de défense en riposte seulement, sur objectif désigné. Limite : {limite}. COLLATIONNEZ.',
    'Armes autorisées : grenades assourdissantes et de désencerclement. Balles de défense sur objectif désigné, en riposte uniquement. Limite : {limite}. COLLATIONNEZ.',
  ]),
  dro('force_niveau_5', { de: 'commandant', a: 'cible', prio: 2, fin: 'aucun' }, [
    'Rappel du cadre : arme de service en légitime défense seulement, absolue nécessité et stricte proportionnalité. COLLATIONNEZ.',
    'Arme de service : légitime défense uniquement, face à une atteinte à la vie, en absolue nécessité. COLLATIONNEZ.',
    'Aucun usage de l\'arme de service hors légitime défense, absolue nécessité et stricte proportionnalité. COLLATIONNEZ.',
  ]),
  dro('force_apercu', { a: 'commandant', fin: 'termine', reponse: true }, [
    'APERÇU. Je collationne : emploi de la force autorisé, limite : {limite}.',
    'REÇU et APERÇU. Je collationne : force autorisée dans la limite : {limite}.',
    'APERÇU, autorisation bien reçue. Je collationne la limite : {limite}.',
  ]),
  dro('force_suspendue', { de: 'commandant', a: 'tous', prio: 2, fin: 'termine' }, [
    'Halte à l\'emploi de la force : le trouble a cessé. Retour au barrage statique.',
    'Cessez l\'emploi de la force. Le trouble a cessé, tenez la position sans contact.',
    'Fin de l\'emploi de la force, effet immédiat : le trouble a cessé. Rendez compte de vos consommations.',
  ]),
  dro('fin_emploi_force', { de: 'commandant', fin: 'termine' }, [
    'Fin d\'emploi de la force à {heure}, secteur {lieu}. Le trouble a cessé.',
    'Emploi de la force terminé à {heure}, secteur {lieu} : le trouble a cessé.',
    'Le trouble a cessé, secteur {lieu}. Fin d\'emploi de la force à {heure}.',
  ]),
  dro('tir_lbd', { a: 'commandant' }, [
    'Un tir de lanceur de balles de défense, cadre riposte, sur objectif désigné à {distance} mètres. Je fais vérifier l\'état de santé de l\'individu.',
    'Tir de lanceur de balles de défense effectué en riposte, sur objectif désigné à {distance} mètres. Vérification de l\'état de santé de l\'individu en cours.',
    'Compte rendu de tir : une balle de défense, cadre riposte, objectif désigné à {distance} mètres. Je fais vérifier l\'état de santé de la personne.',
  ]),
  dro('desencerclement_employe', { a: 'commandant', prio: 2 }, [
    'Grenade de désencerclement employée, secteur {lieu}. Unité encerclée, lancer au ras du sol.',
    'Emploi d\'une grenade de désencerclement, secteur {lieu}. Lancée à la main au ras du sol, l\'unité était encerclée.',
    'Une grenade de désencerclement lancée au ras du sol, secteur {lieu}. Unité encerclée et prise à partie.',
  ]),
];
