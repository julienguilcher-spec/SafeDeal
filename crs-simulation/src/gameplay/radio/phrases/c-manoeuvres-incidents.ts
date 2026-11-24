/* Radio — manœuvres, interpellations, incidents, secours. */

import { group } from './define';
import type { PhraseDef } from './define';

const man = group('Manœuvres');
const arr = group('Interpellations');
const inc = group('Incidents');
const sec = group('Secours', { canal: 'secours' });

export const PHRASES_MANOEUVRES_INCIDENTS: readonly PhraseDef[] = [
  // ── manœuvres ──
  man('gaz_main', { de: 'commandant', a: 'cible' }, [
    'Lacrymogènes à main sur le secteur {lieu}, sur mon ordre.',
    'Grenades lacrymogènes à main, secteur {lieu}. Vous lancez sur mon ordre.',
    'Lacrymogènes lancés à la main, secteur {lieu}. Attendez mon ordre.',
  ]),
  man('gaz_lanceur', { de: 'commandant', a: 'cible' }, [
    'Lanceurs, {distance} mètres, tir courbe, secteur {lieu}. Sur mon ordre.',
    'Grenades au lanceur sur le secteur {lieu}, tir courbe à {distance} mètres. Attendez mon ordre.',
    'Lanceurs en position, objectif secteur {lieu}, {distance} mètres. Tir courbe, tir tendu interdit, sur mon ordre.',
  ]),
  man('gaz_suspendu', {}, [
    'Tirs de lacrymogènes suspendus, secteur {lieu}.',
    'Arrêt des tirs de lacrymogènes, secteur {lieu}. Je garde les lanceurs en position.',
    'Je cesse les tirs de gaz, secteur {lieu}.',
  ]),
  man('bond_offensif', { de: 'commandant', a: 'cible' }, [
    'Bond offensif, {distance} mètres, en avant, puis halte et réalignement.',
    'Bond offensif de {distance} mètres, secteur {lieu}. Arrêt net, réalignement, sans rechercher le contact.',
    'En avant pour un bond de {distance} mètres, secteur {lieu}. Halte, puis réalignement de la ligne.',
  ]),
  man('bond_realigne', {}, [
    'Bond effectué, secteur {lieu}. Ligne réalignée, boucliers jointifs.',
    'Bond terminé, secteur {lieu}. Halte et réalignement faits.',
    'Halte et réalignement faits, secteur {lieu}. Ligne reformée après le bond.',
  ]),
  man('charge', { de: 'commandant', a: 'cible', prio: 2 }, [
    'Chargez sur {distance} mètres, secteur {lieu}. Arrêt au sifflet, repli au pas sur la ligne de départ.',
    'Charge de {distance} mètres, secteur {lieu}. Arrêt au coup de sifflet, puis repli au pas.',
    'Charge, secteur {lieu}, {distance} mètres. Vous vous arrêtez au sifflet et vous revenez au pas sur la ligne de départ.',
  ]),
  man('charge_arretee', {}, [
    'Charge terminée, secteur {lieu}. Arrêt au sifflet, repli au pas sur la ligne de départ.',
    'Arrêt de la charge au sifflet, secteur {lieu}. Les agents se reforment, aucune poursuite.',
    'Charge arrêtée au sifflet, secteur {lieu}. Ligne reformée, pas de poursuite au-delà.',
  ]),
  man('repli', { de: 'commandant', a: 'cible', fin: 'termine' }, [
    'Rompez le contact, repli par échelons sur le secteur {lieu}.',
    'Repli sur le secteur {lieu}, par échelons. Un groupe couvre pendant que l\'autre recule.',
    'Repli par échelons vers le secteur {lieu}, au pas et en ordre, face à la foule.',
  ]),
  man('repli_effectue', {}, [
    'Repli effectué, secteur {lieu}. Dispositif reformé.',
    'Contact rompu, secteur {lieu}. Nouvelle ligne en place.',
    'Repli terminé, secteur {lieu}. Unité regroupée, ligne reformée.',
  ]),
  man('encerclement_ordre', { de: 'commandant', a: 'cible' }, [
    'Encerclez le groupe violent, secteur {lieu}. Un point de sortie contrôlé reste ouvert, information des personnes retenues toutes les minutes.',
    'Bouclage de l\'îlot, secteur {lieu}, pour faire cesser les violences. Sortie contrôlée ouverte, annonce aux personnes retenues toutes les minutes.',
    'Encerclement du groupe à l\'origine des violences, secteur {lieu}. Point de sortie contrôlé, durée strictement nécessaire, annonce chaque minute.',
  ]),
  man('encerclement_en_place', {}, [
    'Encerclement en place, secteur {lieu}. Nombre de personnes retenues : {nombre}. Point de sortie contrôlé ouvert.',
    'Bouclage effectué, secteur {lieu}. Nombre de personnes retenues : {nombre}. Sortie contrôlée tenue par mes agents.',
    'Nasse en place, secteur {lieu}. Nombre de personnes à l\'intérieur : {nombre}. Point de sortie contrôlé ouvert.',
  ]),
  man('encerclement_leve', {}, [
    'Encerclement levé, secteur {lieu}. Les personnes retenues sortent par le point contrôlé.',
    'Levée du bouclage, secteur {lieu}. Les personnes retenues quittent les lieux par la sortie contrôlée.',
    'Fin de l\'encerclement, secteur {lieu}. Sortie des personnes retenues en cours.',
  ]),
  man('refoulement', { de: 'commandant', a: 'cible' }, [
    'Refoulement par bonds de cinquante mètres, limite : {limite}. Issue libre devant la foule.',
    'Refoulez la foule au pas, par tronçons de cinquante mètres, limite : {limite}. Une issue reste libre devant elle.',
    'Vague de refoulement, limite : {limite}. Ligne au pas, arrêt entre deux bonds, issue toujours libre devant les manifestants.',
  ]),
  man('refoulement_effectue', {}, [
    'Refoulement effectué, secteur {lieu}. Limite atteinte, je tiens la ligne.',
    'Limite de refoulement atteinte, secteur {lieu}. Ligne arrêtée et réalignée.',
    'Refoulement terminé, secteur {lieu}. Je m\'arrête sur la limite fixée.',
  ]),
  man('tortue', {}, [
    'Tortue formée, secteur {lieu}. Boucliers de face et au-dessus des têtes.',
    'Passage en tortue, secteur {lieu}. Boucliers de face et au-dessus des têtes, jets nourris.',
    'Formation en tortue, secteur {lieu}. Les agents sont couverts, plus aucun tir possible de mon côté.',
  ]),
  man('ligne_formee', {}, [
    'Ligne formée, secteur {lieu}, face {direction}. Boucliers jointifs, deuxième rang en place.',
    'Mise en ligne terminée, secteur {lieu}, face {direction}. Deuxième rang derrière les boucliers.',
    'Ligne de barrage constituée, secteur {lieu}, face {direction}. Prêt à tenir.',
  ]),
  man('dispersion_en_cours', {}, [
    'Dispersion en cours, secteur {lieu}. Volume restant : {nombre}.',
    'La foule se disperse, secteur {lieu}. Volume restant : {nombre}.',
    'Dispersion engagée, secteur {lieu}. Volume restant : {nombre}, l\'issue reste libre.',
    'Les manifestants quittent les lieux, secteur {lieu}. Volume restant : {nombre}.',
  ]),
  man('dispersion_effectuee', {}, [
    'Dispersion effective à {heure}, secteur {lieu}. Chaussée libre.',
    'Dispersion terminée à {heure}, secteur {lieu}. Plus personne sur la chaussée.',
    'Chaussée libre, secteur {lieu}. Dispersion effective à {heure}.',
  ]),

  // ── interpellations (toujours sur un fait constaté, bible H.1) ──
  arr('interpellation_ordre', { de: 'commandant', a: 'cible' }, [
    'Interpellez l\'individu désigné, secteur {lieu}, sur fait constaté. Signalement : {signalement}.',
    'Interpellation sur fait constaté, secteur {lieu}. Signalement de l\'objectif : {signalement}. Aucune autre cible.',
    'Objectif désigné pour interpellation, secteur {lieu}, sur fait constaté. Signalement : {signalement}.',
  ]),
  arr('interpellation_en_cours', {}, [
    'Interpellation en cours, secteur {lieu}. Le groupe d\'interpellation est sorti de la ligne.',
    'Je procède à une interpellation, secteur {lieu}. Groupe d\'interpellation engagé, la ligne couvre.',
    'Interpellation engagée, secteur {lieu}. Saisie de l\'individu désigné en cours.',
  ]),
  // (un mot par chose : l'interpellé est « conduit » au fourgon cellulaire par deux collègues, il y attend son transfert ;
  // « remis à l'officier de police judiciaire » ne se dit qu'au commissariat)
  arr('interpellation_effectuee', {}, [
    'Un interpellé pour {motif}, à {heure}, secteur {lieu}. Il est conduit au fourgon cellulaire.',
    'Interpellation effectuée à {heure}, secteur {lieu}. Motif : {motif}. L\'individu est conduit au fourgon cellulaire.',
    'Individu interpellé à {heure}, secteur {lieu}, pour {motif}. Conduit au fourgon cellulaire, en attente de transfert.',
  ]),
  arr('interpelle_conduit', {}, [
    'Un interpellé conduit au fourgon cellulaire, secteur {lieu}. Deux agents l\'accompagnent.',
    'Interpellé conduit par deux agents au fourgon cellulaire, secteur {lieu}.',
    'Deux agents conduisent un interpellé au fourgon cellulaire, secteur {lieu}.',
  ]),
  arr('remise_interpelle', {}, [
    'Interpellés à bord du fourgon cellulaire à {heure}, en attente de transfert. Nombre : {nombre}. Fiches transmises.',
    'Nombre d\'interpellés à bord du fourgon cellulaire : {nombre}, à {heure}. En attente de transfert, fiches d\'interpellation jointes.',
    'Interpellés en attente de transfert au commissariat, à bord du fourgon cellulaire à {heure}. Nombre : {nombre}. Fiches transmises.',
  ]),

  // ── incidents : signalement, délégation, compte rendu ──
  inc('incident_feu', { prio: 2 }, [
    'URGENT. Feu signalé, secteur {lieu}. Nature : {type}. Je demande un moyen d\'extinction.',
    'URGENT. Feu en cours, secteur {lieu}. Nature : {type}. Extinction à prévoir avant propagation.',
    'URGENT. Foyer repéré, secteur {lieu}. Nature : {type}. Je demande les moyens d\'extinction.',
    'URGENT. Départ de feu, secteur {lieu}. Nature : {type}. Moyen d\'extinction à désigner.',
  ]),
  inc('incident_feu_reprise', { prio: 2 }, [
    'URGENT. Reprise de feu, secteur {lieu}. Une batterie s\'est rallumée, il faut de l\'eau en quantité.',
    'URGENT. Le feu reprend, secteur {lieu}. Batterie de vélo ou de trottinette rallumée, l\'extincteur ne suffit pas.',
    'URGENT. Foyer rallumé, secteur {lieu}. Feu de batterie, je demande le canon à eau ou les pompiers.',
  ]),
  inc('incident_blesse', { prio: 2 }, [
    'URGENT. Blessé à aller chercher, secteur {lieu}. Gravité : {gravite}. Équipe à désigner pour l\'extraire.',
    'URGENT. Personne blessée à secourir, secteur {lieu}. Gravité : {gravite}. Il faut une équipe pour l\'extraire.',
    'URGENT. Blessé signalé, secteur {lieu}. Gravité : {gravite}. Je demande une équipe d\'extraction.',
  ]),
  inc('incident_pillage', { prio: 2 }, [
    'Pillage en cours, secteur {lieu}. Commerce forcé, effectif du groupe : {nombre}. Unité à désigner.',
    'Pillage signalé, secteur {lieu}. Vitrine brisée et marchandise emportée, effectif du groupe : {nombre}.',
    'Un commerce est pillé, secteur {lieu}. Effectif du groupe : {nombre}. Je demande une unité pour intervenir.',
  ]),
  inc('incident_barricade', {}, [
    'Barricade signalée, secteur {lieu}. Matériaux : {objet}. Obstacle à dégager.',
    'Barricade en travers de la voie, secteur {lieu}. Matériaux : {objet}. Moyen de dégagement à désigner.',
    'Barricade dressée sur la chaussée, secteur {lieu}. Matériaux : {objet}. Elle bloque le passage des unités.',
  ]),
  inc('incident_automobiliste', {}, [
    'Automobiliste bloqué dans la foule, secteur {lieu}. Je demande une unité pour le dégager.',
    'Véhicule civil immobilisé au milieu de la foule, secteur {lieu}. Occupants à bord, dégagement à prévoir.',
    'Conducteur bloqué par la foule, secteur {lieu}. Il ne peut ni avancer ni reculer, unité à désigner.',
  ]),
  inc('incident_secours_bloques', { prio: 2 }, [
    'URGENT. Secours empêchés d\'avancer, secteur {lieu}. Il faut leur ouvrir un couloir.',
    'URGENT. Véhicule de secours bloqué, secteur {lieu}. Je demande une unité pour dégager l\'accès.',
    'URGENT. Les secours ne passent plus, secteur {lieu}. Couloir à ouvrir et à tenir.',
  ]),
  inc('incident_suspect', {}, [
    'Individu suspect signalé, secteur {lieu}. Signalement : {signalement}. Unité à désigner pour le contrôler.',
    'Comportement suspect, secteur {lieu}. Signalement de l\'individu : {signalement}. Contrôle à prévoir.',
    'Je signale un individu à contrôler, secteur {lieu}. Signalement : {signalement}.',
  ]),
  inc('incident_delegue', { de: 'commandant', a: 'cible' }, [
    'Je vous confie un incident, secteur {lieu}. Nature : {type}. Vous y allez et vous rendez compte.',
    'Prenez en charge l\'incident du secteur {lieu}. Nature : {type}. Compte rendu dès qu\'il est traité.',
    'Incident pour votre unité, secteur {lieu}. Nature : {type}. Rendez compte à l\'achèvement.',
    'Traitez l\'incident du secteur {lieu}. Nature : {type}. Vous rendez compte à la fin.',
  ]),
  inc('incident_accuse', { a: 'commandant', fin: 'termine', reponse: true }, [
    'APERÇU, je prends l\'incident.',
    'REÇU, je me porte sur l\'incident et je rends compte.',
    'APERÇU. Mon unité se rend sur l\'incident.',
  ]),
  inc('incident_traite', { a: 'commandant' }, [
    'Incident traité, secteur {lieu}. Nature : {type}. Je reprends ma mission.',
    'Incident réglé, secteur {lieu}. Nature : {type}. Je me remets à votre disposition.',
    'Intervention terminée, secteur {lieu}. Nature : {type}. Incident clos.',
    'Compte rendu d\'incident, secteur {lieu}. Nature : {type}. Traité, rien d\'autre à signaler.',
  ]),
  inc('incident_aggrave', { de: 'central', a: 'commandant', prio: 2 }, [
    'URGENT. L\'incident du secteur {lieu} s\'aggrave. Nature : {type}. Aucun moyen n\'est encore engagé.',
    'URGENT. Incident non traité, secteur {lieu}. Nature : {type}. La situation empire, désignez un moyen.',
    'URGENT. Aggravation de l\'incident, secteur {lieu}. Nature : {type}. Il faut y engager un moyen sans attendre.',
  ]),
  inc('incident_echec', { de: 'central', a: 'commandant', fin: 'termine' }, [
    'Incident clos sans traitement, secteur {lieu}. Nature : {type}. Je le porte au compte rendu.',
    'L\'incident du secteur {lieu} n\'a pas été traité à temps. Nature : {type}. Il figurera au compte rendu.',
    'Incident non traité, secteur {lieu}. Nature : {type}. Trop tard pour intervenir, mention au compte rendu.',
  ]),
  inc('ordre_eteindre', { de: 'commandant', a: 'cible' }, [
    'Éteignez le feu, secteur {lieu}. Nature : {type}. Porte-extincteur sous la protection des boucliers.',
    'Feu à éteindre, secteur {lieu}. Nature : {type}. Envoyez votre porte-extincteur, couvert par les boucliers.',
    'Extinction à votre charge, secteur {lieu}. Nature : {type}. Porte-extincteur en avant, boucliers en protection.',
  ]),
  inc('ordre_secourir', { de: 'commandant', a: 'cible', prio: 2 }, [
    'Allez chercher le blessé, secteur {lieu}. Deux boucliers couvrent, deux agents le ramènent derrière la ligne.',
    'Blessé à extraire, secteur {lieu}. Envoyez un groupe : boucliers en protection, évacuation derrière la ligne.',
    'Extraction du blessé, secteur {lieu}. Un groupe y va sous la protection des boucliers et le ramène à l\'abri.',
  ]),

  // ── secours : pompiers et SAMU s'appellent par radio et n'entrent que sous protection ──
  sec('secours_demande_pompiers', { prio: 2 }, [
    'URGENT. Demande sapeurs-pompiers, secteur {lieu}. Nature : {type}. Accès : {acces}. Je sécurise.',
    'URGENT. Je demande les pompiers, secteur {lieu}. Nature : {type}. Accès : {acces}. Je sécurise.',
    'URGENT. Pompiers demandés, secteur {lieu}. Nature : {type}. Accès conseillé : {acces}. Mon unité sécurise.',
    'URGENT. Appel aux sapeurs-pompiers, secteur {lieu}. Nature : {type}. Accès : {acces}. Protection assurée par mon unité.',
  ]),
  sec('secours_demande_samu', { prio: 2 }, [
    'URGENT. Demande SANTÉ sur place, secteur {lieu}. Gravité : {gravite}. Accès : {acces}. Je sécurise.',
    'URGENT. Je demande le SAMU, secteur {lieu}. Gravité : {gravite}. Accès : {acces}. Je sécurise.',
    'URGENT. Secours médicaux demandés, secteur {lieu}. Gravité : {gravite}. Accès : {acces}. Je protège la victime.',
    'URGENT. Équipe médicale demandée, secteur {lieu}. Gravité : {gravite}. Accès : {acces}. Mon unité sécurise.',
  ]),
  sec('secours_en_route', { de: 'central', a: 'unite', fin: 'termine', reponse: true }, [
    'Secours en route vers le secteur {lieu}. Délai : {duree} minutes. Préparez l\'accès.',
    'Les secours sont partis pour le secteur {lieu}. Délai estimé : {duree} minutes, préparez l\'accès.',
    'Secours engagés sur le secteur {lieu}. Arrivée dans {duree} minutes, tenez un accès dégagé.',
  ]),
  sec('secours_attente_securisation', { de: 'samu', a: 'unite', prio: 2 }, [
    'Nous sommes arrêtés à la limite de la zone, secteur {lieu}. Nous attendons la sécurisation avant d\'avancer.',
    'En attente de sécurisation, secteur {lieu}. Nous n\'avançons pas sans protection ni itinéraire dégagé.',
    'Zone non sûre, secteur {lieu}. Les secours restent à distance : demande d\'escorte et de couloir.',
    'Secours à l\'arrêt, secteur {lieu}. Il nous faut un accès protégé pour intervenir.',
  ]),
  sec('ordre_proteger_secours', { de: 'commandant', a: 'cible', prio: 2, canal: 'unite' }, [
    'Protégez les secours, secteur {lieu}. Ouvrez un couloir de trois mètres cinquante et tenez-le.',
    'Escortez les secours jusqu\'au secteur {lieu}. Couloir de trois mètres cinquante, boucliers de part et d\'autre.',
    'Couloir pour les secours, secteur {lieu}, largeur trois mètres cinquante. Vous le tenez jusqu\'à leur départ.',
  ]),
  sec('secours_itineraire_libre', { a: 'samu', fin: 'termine' }, [
    'Couloir ouvert pour vous, largeur trois mètres cinquante. Accès : {acces}. Zone sécurisée, vous pouvez avancer.',
    'Itinéraire dégagé. Accès : {acces}. Couloir de trois mètres cinquante tenu par mes agents, vous pouvez avancer.',
    'Accès sécurisé : {acces}. Avancez par le couloir, mes agents vous couvrent des deux côtés.',
  ]),
  sec('secours_sur_place', { de: 'samu', fin: 'termine' }, [
    'Secours sur place, secteur {lieu}. Prise en charge en cours.',
    'Équipe arrivée, secteur {lieu}. Nous commençons l\'intervention.',
    'Sur place, secteur {lieu}. Intervention en cours.',
  ]),
  sec('secours_evacuation', { de: 'samu' }, [
    'Victime prise en charge, évacuation en cours depuis le secteur {lieu}. Gravité : {gravite}.',
    'Évacuation engagée, secteur {lieu}. Une victime transportée. Gravité : {gravite}.',
    'Départ du secteur {lieu} avec une victime à bord. Gravité : {gravite}.',
  ]),
  sec('pompiers_feu_eteint', { de: 'pompiers' }, [
    'Feu éteint, secteur {lieu}. Nature : {type}. Nous surveillons les points chauds.',
    'Extinction terminée, secteur {lieu}. Nature : {type}. Surveillance des points chauds en cours.',
    'Foyer éteint à la lance, secteur {lieu}. Nature : {type}. Nous restons le temps de noyer les braises.',
  ]),
  sec('secours_termine', { de: 'samu', fin: 'termine' }, [
    'Intervention terminée, secteur {lieu}. Nous quittons la zone.',
    'Fin de l\'intervention, secteur {lieu}. Disponibles pour une autre mission.',
    'Intervention de secours terminée, secteur {lieu}. Nous regagnons le point de rassemblement des victimes.',
  ]),
];
