/* Radio — manœuvres, interpellations, incidents, secours. */

import { group } from './define';
import type { PhraseDef } from './define';

const man = group('Manœuvres');
const arr = group('Interpellations');
const inc = group('Incidents');
const sec = group('Secours');

export const PHRASES_MANOEUVRES_INCIDENTS: readonly PhraseDef[] = [
  // ── manœuvres ──
  man('gaz_main', { de: 'commandant', a: 'cible' }, [
    'Lacrymogènes à main sur le carrefour, secteur {lieu}. Sur mon ordre.',
    'Jets de grenades lacrymogènes à main, secteur {lieu}. Vent de {direction}, attention au retour.',
    'Gaz à main autorisé sur le groupe en tête, secteur {lieu}. Tir dans la foule interdit, objectif désigné.',
  ]),
  man('gaz_lanceur', { de: 'commandant', a: 'cible' }, [
    'Lanceurs, tir courbe sur le secteur {lieu}, portée {distance} mètres. Sur mon ordre.',
    'Tir de grenades au lanceur, secteur {lieu}, tir courbe à {distance} mètres. Attendez mon ordre.',
    'Lanceurs en position, objectif secteur {lieu}. Tir courbe, pas de tir tendu, distance : {distance} mètres.',
  ]),
  man('gaz_suspendu', {}, [
    'Tirs de gaz suspendus, secteur {lieu}. Le vent rabat les nuages vers la ligne.',
    'Arrêt des tirs de lacrymogènes, secteur {lieu}. Dotation conservée et masques en place.',
    'Je cesse les tirs de gaz, secteur {lieu}. L\'objectif est atteint, la foule s\'éloigne.',
  ]),
  man('bond_offensif', { de: 'commandant', a: 'cible' }, [
    'Bond offensif, {distance} mètres en avant, puis halte et réalignement.',
    'Bond offensif sur {distance} mètres, secteur {lieu}. Arrêt net, ligne reformée, pas de contact recherché.',
    'En avant sur {distance} mètres, secteur {lieu}. Halte puis réalignement dès l\'arrêt.',
  ]),
  man('bond_realigne', {}, [
    'Bond effectué, secteur {lieu}. Ligne réalignée, boucliers jointifs.',
    'Réalignement terminé, secteur {lieu}. Nouvelle position tenue face {direction}.',
    'Halte et réalignement faits, secteur {lieu}. Prêt pour le prochain bond.',
  ]),
  man('charge', { de: 'commandant', a: 'cible', prio: 2 }, [
    'Chargez jusqu\'au secteur {lieu}, arrêt au sifflet. Distance : {distance} mètres.',
    'Charge sur {distance} mètres, secteur {lieu}. Course puis arrêt au coup de sifflet, repli au pas.',
    'Charge autorisée vers le secteur {lieu}. À l\'arrêt, reformez la ligne immédiatement.',
  ]),
  man('charge_arretee', {}, [
    'Charge terminée, secteur {lieu}. Arrêt au sifflet, repli au pas sur la ligne de départ.',
    'Arrêt de la charge au sifflet, secteur {lieu}. Les agents se reforment, aucune poursuite.',
    'Charge stoppée, secteur {lieu}. Ligne reformée, la foule est repoussée de {distance} mètres.',
  ]),
  man('repli', { de: 'commandant', a: 'cible', fin: 'termine' }, [
    'Rompez le contact, repli par échelons sur la ligne des véhicules.',
    'Repli sur le secteur {lieu}, par échelons. Un groupe couvre pendant que l\'autre recule.',
    'Repli ordonné vers le secteur {lieu}, au pas et en ordre. Ne tournez pas le dos à la foule.',
  ]),
  man('repli_effectue', {}, [
    'Repli effectué, secteur {lieu}. Dispositif reformé, effectif au complet.',
    'Rupture du contact réussie, secteur {lieu}. Nouvelle ligne tenue à {distance} mètres.',
    'Repli terminé sur le secteur {lieu}. Aucun agent resté en arrière.',
  ]),
  man('encerclement_ordre', { de: 'commandant', a: 'cible' }, [
    'Bouclage de l\'îlot, secteur {lieu}. Sortie contrôlée, annonce aux personnes retenues toutes les minutes.',
    'Encerclez le groupe, secteur {lieu}. Une issue contrôlée doit rester ouverte, priorité aux femmes et aux enfants.',
    'Nasse sur le secteur {lieu}. Fermez les débouchés, contrôle des identités à la sortie.',
  ]),
  man('encerclement_en_place', {}, [
    'Encerclement en place, secteur {lieu}. Une issue contrôlée côté {direction}, densité surveillée.',
    'Nasse en place, secteur {lieu}. Personnes retenues : {nombre}, contrôle à la sortie.',
    'Bouclage effectué, secteur {lieu}. Effectif encerclé : {nombre}, issue contrôlée ouverte.',
  ]),
  man('refoulement', { de: 'commandant', a: 'cible' }, [
    'Refoulement, axe {direction}, limite : {limite}, par bonds de cinquante mètres. Issue libre devant la foule.',
    'Refoulez la foule jusqu\'au secteur {lieu}. Ligne au pas, arrêt de dix secondes entre deux tronçons.',
    'Refoulement progressif vers {direction}, secteur {lieu}. Toujours une issue ouverte devant les manifestants.',
  ]),
  man('tortue', {}, [
    'Tortue formée, secteur {lieu}. Boucliers de face et au-dessus des têtes, plus aucun tir possible.',
    'Passage en tortue, secteur {lieu}. Jets nourris, la ligne avance à très faible allure.',
    'Formation en tortue, secteur {lieu}. Je protège les agents contre les projectiles et le feu.',
  ]),
  man('ligne_formee', {}, [
    'Ligne formée, secteur {lieu}, face {direction}. Boucliers jointifs, deuxième rang en place.',
    'Mise en ligne terminée, secteur {lieu}. Lanceurs et chefs de groupe derrière les boucliers.',
    'Ligne de barrage constituée face {direction}, secteur {lieu}. Prêt à tenir.',
  ]),
  man('dispersion_en_cours', {}, [
    'Dispersion en cours, secteur {lieu}. La foule reflue vers {direction}, je maintiens la pression.',
    'La foule se disperse, secteur {lieu}. Départ par les rues latérales, effectif restant : {nombre}.',
    'Dispersion engagée, secteur {lieu}. Je laisse une issue libre vers {direction}.',
    'Les manifestants quittent la place, secteur {lieu}. Dispersion progressive, effectif restant : {nombre}.',
  ]),
  man('dispersion_effectuee', { fin: 'parlez' }, [
    'Dispersion effective, chaussée libre, secteur {lieu}. Fin de l\'emploi de la force à {heure}.',
    'Plus personne sur le secteur {lieu}. Dispersion terminée à {heure}, dispositif maintenu.',
    'Place dégagée, secteur {lieu}. Dispersion effective à {heure}, je reconnais les abords.',
  ]),

  // ── interpellations ──
  arr('interpellation_ordre', { de: 'commandant', a: 'cible' }, [
    'Interpellez sur fait constaté : l\'individu désigné, secteur {lieu}. Objectif désigné par le drone.',
    'Interpellation sur le secteur {lieu}, sur fait constaté. Pas d\'initiative hors cible désignée.',
    'Ciblez l\'auteur des jets, secteur {lieu}. Interpellation sur fait constaté, binôme de protection.',
  ]),
  arr('interpellation_en_cours', {}, [
    'Interpellation en cours, secteur {lieu}. Un individu maîtrisé, menottage en cours.',
    'Je procède à une interpellation, secteur {lieu}. Auteur de jets sur les agents, protection du binôme.',
    'Interpellation engagée, secteur {lieu}. L\'individu résiste, je le maîtrise.',
  ]),
  arr('interpellation_effectuee', {}, [
    'Interpellé : un individu pour jet de projectile sur agents, à {heure}. Fait filmé, conduit au point de regroupement.',
    'Interpellation effectuée à {heure}, secteur {lieu}. Individus interpellés : {nombre}, état de santé vérifié.',
    'Interpellation terminée, secteur {lieu}. Un individu menotté et palpé, direction le véhicule.',
    'Individu interpellé à {heure}, secteur {lieu}. Il est conduit au point de regroupement pour remise à l\'officier de police judiciaire.',
  ]),
  arr('interpelle_conduit', {}, [
    'Un interpellé est conduit au point de regroupement, secteur {lieu}. Escorte de deux agents.',
    'Transfert de l\'interpellé vers le fourgon, secteur {lieu}. Il est fouillé et surveillé.',
    'Personne interpellée escortée vers le point de remise, secteur {lieu}. Aucune difficulté.',
  ]),
  arr('remise_interpelle', {}, [
    'Remise des interpellés à l\'officier de police judiciaire, à {heure}. Individus remis : {nombre}.',
    'Interpellés remis au point de regroupement, à {heure}. Effectif remis : {nombre}, procédure transmise.',
    'Remise effectuée à l\'officier de police judiciaire, à {heure}. Individus : {nombre}, état de santé noté.',
  ]),

  // ── incidents ──
  inc('incident_feu', { prio: 2, canal: 'commandement' }, [
    'URGENT. Feu signalé, secteur {lieu}. Nature : {type}. Je demande une unité pour l\'éteindre.',
    'URGENT. Début d\'incendie, secteur {lieu}. Nature : {type}. Risque de propagation.',
    'URGENT. Feu en cours, secteur {lieu}. Nature : {type}. Extinction nécessaire avant l\'extension.',
    'URGENT. Foyer repéré, secteur {lieu}. Nature : {type}. Je demande les moyens d\'extinction.',
  ]),
  inc('incident_blesse', { prio: 2, canal: 'commandement' }, [
    'URGENT. Blessé à aller chercher, secteur {lieu}. Gravité : {gravite}. Besoin d\'une équipe pour l\'extraire.',
    'URGENT. Personne blessée à secourir, secteur {lieu}. Gravité : {gravite}. Voie d\'accès à sécuriser.',
    'URGENT. Blessé signalé, secteur {lieu}. Gravité : {gravite}. Équipe de secours à désigner.',
  ]),
  inc('incident_pillage', { prio: 2, canal: 'commandement' }, [
    'Pillage en cours, secteur {lieu}. Boutique visée, effectif : {nombre}. Je demande une unité mobile.',
    'Pillage signalé, secteur {lieu}. Effectif : {nombre}, boutique forcée. Intervention nécessaire.',
    'Des individus pillent un magasin, secteur {lieu}. Effectif : {nombre}. Unité à désigner.',
  ]),
  inc('incident_barricade', { canal: 'commandement' }, [
    'Barricade signalée, secteur {lieu}. Matériaux : {objet}. Obstacle à dégager.',
    'Barricade en travers de la voie, secteur {lieu}. Matériaux : {objet}. Besoin d\'un engin pour la dégager.',
    'Barricade enflammée, secteur {lieu}. Matériaux : {objet}. Extinction puis dégagement à prévoir.',
  ]),
  inc('incident_automobiliste', { canal: 'commandement' }, [
    'Automobiliste bloqué au milieu de la foule, secteur {lieu}. Il est pris à partie, besoin d\'une escorte.',
    'Véhicule civil coincé, secteur {lieu}. Occupants menacés, besoin d\'un dégagement.',
    'Conducteur en difficulté, secteur {lieu}. Voiture encerclée, je demande une unité de protection.',
  ]),
  inc('incident_secours_bloques', { prio: 2, canal: 'commandement' }, [
    'URGENT. Secours empêchés d\'avancer, secteur {lieu}. Voie obstruée, il faut ouvrir un couloir.',
    'URGENT. Le véhicule de secours est bloqué, secteur {lieu}. Besoin d\'une escorte pour dégager l\'accès.',
    'URGENT. Secours coincés dans la foule, secteur {lieu}. Je demande un dégagement de la chaussée.',
  ]),
  inc('incident_delegue', { de: 'commandant', a: 'cible', canal: 'unite' }, [
    'Je vous confie l\'incident, secteur {lieu} : {type}. Vous y allez, vous rendez compte.',
    'Prenez en charge l\'incident du secteur {lieu}. Nature : {type}. Compte rendu dès que c\'est traité.',
    'Incident délégué à votre unité, secteur {lieu}. Nature : {type}. Urgence : {niveau}.',
    '{cible}, traitez l\'incident, secteur {lieu}. Nature : {type}. Rendez compte à l\'achèvement.',
  ]),
  inc('incident_accuse', { a: 'commandant', canal: 'unite', fin: 'termine' }, [
    'Aperçu, je prends l\'incident, secteur {lieu}.',
    'Reçu, j\'y vais. Incident du secteur {lieu}, je rends compte.',
    'Aperçu, mon unité se rend sur l\'incident, secteur {lieu}. Arrivée dans {duree} minutes.',
  ]),
  inc('incident_traite', { a: 'commandant', canal: 'unite' }, [
    'Incident traité, secteur {lieu}. Nature : {type}. Retour à ma position.',
    'Incident réglé, secteur {lieu}. Nature : {type}. Je reprends ma mission.',
    'Intervention terminée, secteur {lieu}. Nature : {type}. Rien à signaler de plus.',
    'C\'est fait, secteur {lieu}. Nature : {type}. Je me remets à disposition.',
  ]),
  inc('incident_aggrave', { de: 'central', a: 'unite', prio: 2, canal: 'commandement' }, [
    'URGENT. L\'incident du secteur {lieu} s\'aggrave : {type}. Il faut agir sans attendre.',
    'URGENT. Situation qui empire, secteur {lieu}. Nature : {type}. Personne n\'est encore intervenu.',
    'URGENT. Incident non traité, secteur {lieu}. Nature : {type}. Gravité en hausse, désignez un moyen.',
  ]),
  inc('incident_echec', { de: 'central', a: 'unite', canal: 'commandement' }, [
    'L\'incident du secteur {lieu} n\'a pas pu être traité. Nature : {type}. Il est abandonné.',
    'Incident perdu, secteur {lieu}. Nature : {type}. Les dégâts sont constatés.',
    'Échec du traitement de l\'incident, secteur {lieu}. Nature : {type}. Je note la perte.',
  ]),

  // ── secours ──
  sec('secours_demande_pompiers', { prio: 2, canal: 'secours' }, [
    'URGENT. Je demande les pompiers, secteur {lieu}. Nature : {type}. Accès par {voie}.',
    'URGENT. Demande de sapeurs-pompiers, secteur {lieu}. Nature : {type}. Je sécurise l\'accès.',
    'URGENT. Pompiers demandés sur le secteur {lieu}. Nature : {type}. Voie conseillée : {voie}.',
    'URGENT. Appel des pompiers, secteur {lieu}. Nature : {type}. Mon unité se tient à leur disposition.',
  ]),
  sec('secours_demande_samu', { prio: 2, canal: 'secours' }, [
    'URGENT. Je demande SANTÉ sur place, secteur {lieu}. Blessé : {gravite}. Je sécurise.',
    'URGENT. Demande du SAMU, secteur {lieu}. Blessé : {gravite}. Accès par {voie}.',
    'URGENT. Médecin demandé, secteur {lieu}. Blessé : {gravite}. L\'équipe peut approcher par {voie}.',
    'URGENT. Secours médicaux demandés, secteur {lieu}. Blessé : {gravite}. Couloir en cours de dégagement.',
  ]),
  sec('secours_en_route', { de: 'central', a: 'unite', canal: 'secours', fin: 'termine' }, [
    'Les secours sont en route vers le secteur {lieu}. Arrivée dans {duree} minutes.',
    '{cible} part pour le secteur {lieu}. Délai estimé : {duree} minutes, prévoyez l\'accès.',
    'Secours engagés, secteur {lieu}. Ils arrivent par {voie}, dans {duree} minutes.',
  ]),
  sec('secours_attente_securisation', { de: 'samu', a: 'unite', canal: 'secours', prio: 2 }, [
    'Nous sommes à la limite de la zone, secteur {lieu}. Nous attendons la sécurisation avant d\'avancer.',
    'En attente de sécurisation, secteur {lieu}. Nous ne progressons pas sans protection ni itinéraire dégagé.',
    'Zone non sûre, secteur {lieu}. Les secours restent à distance, demande d\'escorte et de couloir.',
    'Secours à l\'arrêt, secteur {lieu}. Besoin d\'un accès protégé pour intervenir.',
  ]),
  sec('secours_itineraire_libre', { a: 'samu', canal: 'secours', fin: 'termine' }, [
    'Couloir pour SANTÉ, axe {voie}, largeur de trois mètres cinquante, zone sécurisée. Vous pouvez avancer.',
    'Itinéraire dégagé, secteur {lieu}. Axe {voie}, vous pouvez avancer, mes agents vous couvrent.',
    'Accès sécurisé jusqu\'au secteur {lieu}. Vous progressez, ma ligne protège les côtés.',
  ]),
  sec('secours_sur_place', { de: 'samu', a: 'unite', canal: 'secours', fin: 'termine' }, [
    'Secours sur place, secteur {lieu}. Prise en charge en cours.',
    'Équipe arrivée sur le secteur {lieu}. Nous commençons les soins.',
    'Sur place, secteur {lieu}. Évaluation de la victime en cours.',
  ]),
  sec('secours_evacuation', { de: 'samu', a: 'central', canal: 'secours' }, [
    'Victime prise en charge, évacuation en cours depuis le secteur {lieu}. Gravité : {gravite}.',
    'Évacuation engagée, secteur {lieu}. Une victime transportée, gravité : {gravite}.',
    'Départ du véhicule de secours, secteur {lieu}. Une victime à bord, gravité : {gravite}.',
  ]),
  sec('secours_termine', { de: 'samu', a: 'central', canal: 'secours', fin: 'termine' }, [
    'Intervention terminée, secteur {lieu}. Les secours quittent la zone.',
    'Fin de l\'intervention de secours, secteur {lieu}. Libre pour une autre mission.',
    'Secours terminés, secteur {lieu}. Nous regagnons le point de rassemblement.',
  ]),
];
