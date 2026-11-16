/* Radio — contrôle, mise en place, préparation et prévention, comptes rendus de situation, signes avant-coureurs. */

import { group } from './define';
import type { PhraseDef } from './define';

const prep = group('Contrôle et mise en place');
const pre = group('Préparation et prévention');
const sit = group('Compte rendu de situation');
const sig = group('Signes avant-coureurs');

export const PHRASES_MISE_EN_PLACE: readonly PhraseDef[] = [
  // ── contrôle et mise en place ──
  prep('radio_controle', {}, [
    'Contrôle radio.',
    'Essai radio, comment me recevez-vous ?',
    'Contrôle de la liaison avant la mise en place.',
    'Vérification radio, je me présente sur le réseau.',
  ]),
  prep('radio_controle_reponse', { de: 'central', a: 'unite', fin: 'termine', reponse: true }, [
    'FORT ET CLAIR.',
    'Je vous reçois FORT ET CLAIR, liaison établie.',
    'FORT ET CLAIR, vous êtes sur le réseau.',
    'FORT ET LISIBLE, liaison correcte.',
  ]),
  prep('central_recu', { de: 'central', a: 'unite', fin: 'termine', reponse: true }, [
    'REÇU.',
    'Bien REÇU, je note.',
    'REÇU, poursuivez votre mission.',
  ]),
  prep('central_attendez', { de: 'central', a: 'unite', fin: 'aucun', reponse: true }, [
    'ATTENDEZ.',
    'REÇU. ATTENDEZ, je traite votre demande.',
    'ATTENDEZ, je vous rappelle.',
  ]),
  prep('stationnement', {}, [
    'Compagnie en zone de stationnement, secteur {lieu}. Effectif à pied : {effectif}. Nombre de fourgons : {nombre}. Prêt.',
    'En place sur la zone de stationnement, secteur {lieu}. Effectif à pied : {effectif}. Nombre de fourgons : {nombre}. Disponible.',
    'Zone de stationnement atteinte, secteur {lieu}. Effectif à pied : {effectif}. Nombre de fourgons : {nombre}, alignés cap vers la sortie.',
    'Arrivée en zone d\'attente, secteur {lieu}. Effectif à pied : {effectif}. Nombre de fourgons : {nombre}. Prêt à recevoir la mission.',
  ]),
  prep('mission_donnee', { de: 'central', a: 'unite', fin: 'aucun' }, [
    'Mission : {mission}. Secteur {lieu}. Cadre : {cadre}. FAITES L\'APERÇU.',
    'Je vous confie la mission suivante : {mission}, secteur {lieu}. Cadre : {cadre}. FAITES L\'APERÇU.',
    'Pour vous : {mission}, secteur {lieu}. Cadre : {cadre}. FAITES L\'APERÇU.',
    'Mission du commandement : {mission}, secteur {lieu}. Cadre : {cadre}. FAITES L\'APERÇU.',
  ]),
  prep('mission_apercu', { fin: 'termine', reponse: true }, [
    'APERÇU.',
    'APERÇU, mission prise en compte : {mission}.',
    'REÇU et APERÇU, j\'exécute : {mission}.',
  ]),
  prep('dispositif_en_place', {}, [
    'Dispositif en place, secteur {lieu}, face {direction}. Nombre de sections en ligne : {nombre}. Véhicules en travers. Prêt.',
    'Barrage en place, secteur {lieu}, face {direction}. Nombre de sections en ligne : {nombre}. Véhicules en travers à l\'arrière.',
    'Mise en place terminée, secteur {lieu}, face {direction}. Nombre de sections en ligne : {nombre}. Véhicules en travers derrière la ligne.',
    'Dispositif installé, secteur {lieu}, face {direction}. Nombre de sections en ligne : {nombre}. Boucliers jointifs, véhicules en travers.',
  ]),
  prep('prise_position', {}, [
    'En position, secteur {lieu}, face {direction}.',
    'Position prise, secteur {lieu}. Je tiens face {direction}.',
    'En place secteur {lieu}, face {direction}. Prêt.',
    'Position atteinte, secteur {lieu}. Unité en place face {direction}.',
  ]),
  prep('mouvement', {}, [
    'En mouvement vers le secteur {destination}. Déplacement {moyen}.',
    'Je quitte ma position et je me porte sur le secteur {destination}, déplacement {moyen}.',
    'Départ pour le secteur {destination}, déplacement {moyen}. Je rends compte à l\'arrivée.',
    'En route vers le secteur {destination}, déplacement {moyen}.',
  ]),
  prep('arrivee_zone', {}, [
    'Arrivé sur le secteur {lieu}. Mise en place en cours.',
    'Sur zone, secteur {lieu}. Je me mets en place.',
    'Arrivée effectuée, secteur {lieu}. Prise de dispositif en cours.',
  ]),
  prep('embarquement', {}, [
    'Embarquement en cours, destination : secteur {destination}.',
    'Les groupes embarquent dans les fourgons, destination : secteur {destination}.',
    'Embarquement des groupes en cours. Départ pour le secteur {destination} dès la fin.',
  ]),
  prep('debarquement', {}, [
    'Débarquement en cours, secteur {lieu}, à {distance} mètres de la foule.',
    'Les groupes mettent pied à terre, secteur {lieu}, à {distance} mètres de la foule. Formation en colonne.',
    'Débarquement, secteur {lieu}. Fourgons à {distance} mètres de la foule, les groupes se forment en colonne.',
    'Sections à terre, secteur {lieu}, à {distance} mètres de la foule. Mise en colonne, puis en ligne.',
  ]),
  prep('ordre_tenir', { de: 'commandant', a: 'cible' }, [
    'Tenez le secteur {lieu}, face {direction}. Riposte directe seulement.',
    'Maintenez votre position, secteur {lieu}, face {direction}. Aucun emploi de la force sans mon ordre, riposte directe seulement.',
    'Vous tenez le secteur {lieu}, face {direction}. Distance conservée avec la foule, riposte directe seulement.',
    'Restez en place, secteur {lieu}, face {direction}. Pas d\'initiative sans mon ordre, hors riposte directe.',
  ]),
  prep('ordre_mouvement', { de: 'commandant', a: 'cible' }, [
    'Portez-vous sur le secteur {lieu}, déplacement {moyen}. Rendez compte à l\'arrivée.',
    'Rejoignez le secteur {lieu}, déplacement {moyen}. Compte rendu dès la mise en place.',
    'Mouvement vers le secteur {lieu}, déplacement {moyen}. Vous rendez compte une fois en position.',
  ]),
  prep('ordre_ligne', { de: 'commandant', a: 'cible' }, [
    'Formez un barrage, secteur {lieu}, face {direction}. Boucliers jointifs, deuxième rang en appui.',
    'Ligne de barrage, secteur {lieu}, face {direction}. Boucliers au coude à coude, deuxième rang derrière.',
    'Mettez-vous en ligne, secteur {lieu}, face {direction}. Barrage rectiligne, deuxième rang derrière les boucliers.',
  ]),
  prep('ordre_embarquer', { de: 'commandant', a: 'cible' }, [
    'Embarquez et rejoignez le secteur {lieu}. Débarquement à cinquante mètres de la foule au moins.',
    'Embarquement immédiat, destination : secteur {lieu}. Vous débarquez à cinquante mètres au moins de la foule.',
    'Aux fourgons, puis mouvement vers le secteur {lieu}. Débarquez à distance de la foule, cinquante mètres au moins.',
  ]),
  prep('ordre_recu', { a: 'commandant', fin: 'termine', reponse: true }, [
    'REÇU, j\'exécute.',
    'REÇU, ordre pris en compte.',
    'APERÇU, je m\'en charge.',
    'Bien REÇU, exécution en cours.',
  ]),
  prep('ordre_impossible', { a: 'commandant', reponse: true }, [
    'NÉGATIF. Je ne peux pas exécuter : {raison}.',
    'NÉGATIF, exécution impossible. Motif : {raison}.',
    'NÉGATIF. Ordre non exécutable pour le moment : {raison}.',
  ]),
  prep('ordre_objections', { a: 'commandant', prio: 2 }, [
    'Je fais part de mes objections : l\'ordre reçu me paraît manifestement illégal. Je demande sa confirmation.',
    'Objections sur l\'ordre reçu : il sort du cadre légal de l\'emploi de la force. Confirmez ou annulez.',
    'Je ne peux pas exécuter cet ordre en l\'état : il me paraît illégal. Je fais part de mes objections et j\'attends votre confirmation.',
  ]),

  // ── préparation et prévention (avant l'arrivée de la foule) ──
  pre('prevention_mobilier', {}, [
    'Retrait du mobilier urbain terminé sur le parcours, secteur {lieu}. Poubelles, barrières et conteneurs enlevés.',
    'Parcours dégagé, secteur {lieu}. Poubelles, conteneurs et barrières de chantier retirés de la chaussée.',
    'Mobilier urbain retiré, secteur {lieu}. Plus de poubelles ni de barrières à portée du cortège.',
  ]),
  pre('prevention_controles', {}, [
    'Point de contrôle en place en amont du rassemblement, secteur {lieu}. Nombre de personnes contrôlées : {nombre}.',
    'Contrôles et fouilles en amont, secteur {lieu}. Sacs inspectés, nombre de personnes contrôlées : {nombre}.',
    'Filtrage des accès au rassemblement, secteur {lieu}. Nombre de personnes contrôlées : {nombre}.',
  ]),
  pre('prevention_perimetre', {}, [
    'Périmètre interdit en place, secteur {lieu}. Accès tenus, riverains et secours seuls admis.',
    'Périmètre de protection installé, secteur {lieu}. Les accès sont tenus par mes agents.',
    'Zone interdite matérialisée, secteur {lieu}. Barrières posées, accès gardés.',
  ]),

  // ── compte rendu de situation : nature, volume, attitude ──
  sit('cortege_approche', {}, [
    'Tête de cortège à {distance} mètres, secteur {lieu}. Nature : {nature}. Volume : {nombre}. Attitude : {attitude}.',
    'Le cortège arrive, tête à {distance} mètres, secteur {lieu}. Nature : {nature}. Volume : {nombre}. Attitude : {attitude}.',
    'Tête de cortège en vue à {distance} mètres, secteur {lieu}. Nature : {nature}. Volume : {nombre}. Attitude : {attitude}.',
    'Cortège en approche, secteur {lieu}, tête à {distance} mètres. Nature : {nature}. Volume : {nombre}. Attitude : {attitude}.',
  ]),
  sit('foule_calme', {}, [
    'Foule calme, secteur {lieu}. Volume : {nombre}. Aucun incident.',
    'Ambiance calme, secteur {lieu}. Volume : {nombre}. Rien à signaler.',
    'Attitude calme, secteur {lieu}. Volume : {nombre}. Aucune dégradation constatée.',
    'Cortège paisible, secteur {lieu}. Volume : {nombre}. Aucun geste hostile envers les unités.',
  ]),
  sit('foule_croissante', {}, [
    'L\'affluence grossit, secteur {lieu}. Volume estimé : {nombre}.',
    'Arrivées continues, secteur {lieu}. Volume estimé : {nombre}, en hausse.',
    'La foule s\'épaissit, secteur {lieu}. Volume estimé : {nombre}.',
    'Le rassemblement monte en puissance, secteur {lieu}. Volume estimé : {nombre}.',
  ]),
  sit('foule_tendue', {}, [
    'Attitude tendue en tête, secteur {lieu}. Volume : {nombre}. Invectives vers la ligne.',
    'La tension monte, secteur {lieu}. Volume : {nombre}. Des groupes compacts se rapprochent du dispositif.',
    'Foule nerveuse, secteur {lieu}. Volume : {nombre}. Huées et gestes hostiles.',
    'Climat tendu, secteur {lieu}. Volume : {nombre}. Slogans hostiles, pression sur la ligne.',
  ]),
  sit('foule_hostile', { prio: 2 }, [
    'Foule hostile, secteur {lieu}. Volume : {nombre}. Des groupes déterminés viennent au contact de la ligne.',
    'Attitude hostile, secteur {lieu}. Volume : {nombre}. La ligne est prise à partie.',
    'Attitude hostile en tête de cortège, secteur {lieu}. Volume : {nombre}. Refus de reculer.',
    'Situation hostile, secteur {lieu}. Volume : {nombre}. Groupes violents face aux unités.',
  ]),
  sit('situation_ras', {}, [
    'Rien à signaler, secteur {lieu}. Situation calme.',
    'Néant, secteur {lieu}. Aucun incident.',
    'Situation stable, secteur {lieu}. Rien de particulier à signaler.',
  ]),
  sit('situation_tendue', {}, [
    'Situation tendue, secteur {lieu}. Je reste vigilant et je garde ma réserve à portée.',
    'Les esprits s\'échauffent, secteur {lieu}. Je maintiens la distance et je surveille la tête.',
    'Tension en hausse, secteur {lieu}. Je resserre le dispositif et j\'attends vos instructions.',
  ]),
  sit('situation_degradee', { prio: 2 }, [
    'URGENT. Situation dégradée, secteur {lieu}. Violences en cours, je demande vos instructions.',
    'URGENT. La situation dégénère, secteur {lieu}. Violences en cours, je tiens la position.',
    'URGENT. Violences en cours, secteur {lieu}. La situation m\'échappe, je demande des instructions immédiates.',
  ]),
  sit('situation_apaisee', {}, [
    'Retour au calme, secteur {lieu}. Les violences ont cessé.',
    'La situation s\'apaise, secteur {lieu}. Plus de violences, je maintiens le dispositif.',
    'Calme revenu, secteur {lieu}. Je maintiens le dispositif et j\'attends vos ordres.',
  ]),
  sit('cortege_arrete', {}, [
    'Cortège à l\'arrêt, secteur {lieu}. Tête immobilisée. Volume : {nombre}.',
    'La tête de cortège marque l\'arrêt, secteur {lieu}. Volume : {nombre}.',
    'Cortège arrêté, secteur {lieu}. La tête ne progresse plus. Volume : {nombre}.',
  ]),
  sit('cortege_reparti', {}, [
    'Le cortège repart, secteur {lieu}. Tête en marche. Volume : {nombre}.',
    'Reprise de la marche, secteur {lieu}. Volume : {nombre}.',
    'Cortège de nouveau en mouvement, secteur {lieu}. Volume : {nombre}.',
  ]),
  sit('cortege_hors_parcours', { prio: 2 }, [
    'Le cortège quitte le parcours déclaré, secteur {lieu}. Direction prise : {vers}. Volume : {nombre}.',
    'Sortie du parcours déclaré, secteur {lieu}. Direction prise : {vers}. Volume : {nombre}.',
    'Une partie du cortège s\'engage hors de l\'itinéraire déclaré, secteur {lieu}. Direction : {vers}. Volume : {nombre}.',
  ]),

  // ── signes avant-coureurs (dans l'ordre où ils apparaissent, bible F.2) ──
  sig('signe_nebuleuse', {}, [
    'La nébuleuse de tête grossit, secteur {lieu}. Volume devant la banderole de tête : {nombre}.',
    'Précortège en augmentation, secteur {lieu}. Volume devant le carré de tête : {nombre}.',
    'De plus en plus de monde devant la banderole de tête, secteur {lieu}. Volume : {nombre}.',
  ]),
  sig('signe_visages_couverts', {}, [
    'Visages qui se couvrent, secteur {lieu}. Nombre de personnes masquées : {nombre}.',
    'Cagoules et masques enfilés, secteur {lieu}. Effectif du groupe : {nombre}.',
    'Foulards remontés et lunettes posées, secteur {lieu}. Effectif du groupe qui se dissimule : {nombre}.',
  ]),
  sig('signe_fumigenes', {}, [
    'Fumigène noir allumé en tête, secteur {lieu}. Signal de ralliement probable.',
    'Fumée noire devant la banderole, secteur {lieu}. Possible signal de regroupement.',
    'Un fumigène noir vient d\'être allumé, secteur {lieu}. Je surveille un regroupement autour du signal.',
  ]),
  sig('signe_changement_tenue', {}, [
    'Individus qui se changent à couvert, secteur {lieu}. Tenues sombres sorties des sacs, effectif du groupe : {nombre}.',
    'Changements de tenue repérés, secteur {lieu}. Passage en noir, capuches relevées, effectif du groupe : {nombre}.',
    'Des personnes enfilent des vêtements noirs à l\'abri des regards, secteur {lieu}. Effectif du groupe : {nombre}.',
    'Habillage en noir en cours, secteur {lieu}. Sacs à dos ouverts, effectif du groupe : {nombre}.',
  ]),
  sig('signe_bloc', { prio: 2 }, [
    'Un bloc se forme, secteur {lieu}. Banderole renforcée en tête, effectif : {nombre}.',
    'Groupe compact tout en noir en tête de cortège, secteur {lieu}. Banderole renforcée, effectif : {nombre}.',
    'Regroupement de tenues sombres derrière une banderole renforcée, secteur {lieu}. Effectif : {nombre}.',
    'Formation d\'un bloc compact, secteur {lieu}. Lunettes, gants et capuches, effectif : {nombre}.',
  ]),
  sig('signe_parapluies', {}, [
    'Parapluies ouverts en tête, secteur {lieu}. Ils masquent un groupe, effectif estimé : {nombre}.',
    'Mur de parapluies déployé, secteur {lieu}. Je ne vois plus ce que fait le groupe derrière, effectif estimé : {nombre}.',
    'Parapluies déployés d\'un seul geste, secteur {lieu}. Un groupe se met à l\'abri des regards, effectif estimé : {nombre}.',
  ]),
  sig('signe_depavage', { prio: 2 }, [
    'Chaussée dépavée, secteur {lieu}. Des pavés sont descellés et mis en tas.',
    'Des personnes arrachent des pavés, secteur {lieu}. Un tas de projectiles se constitue.',
    'Dépavage en cours, secteur {lieu}. Les pavés descellés sont rassemblés à l\'arrière du groupe.',
  ]),
  sig('signe_projectiles_reunis', { prio: 2 }, [
    'Réserve de projectiles constituée, secteur {lieu}. Pavés et bouteilles rassemblés derrière le premier rang.',
    'Stock de projectiles repéré, secteur {lieu}. Pavés et bouteilles en tas à l\'arrière du groupe.',
    'Des projectiles passent de main en main, secteur {lieu}. Pavés et bouteilles, jets à prévoir.',
  ]),
  sig('signe_materiel_voie', {}, [
    'Mobilier tiré en travers de la voie, secteur {lieu}. Matériaux : {objet}.',
    'Début de barricade, secteur {lieu}. Matériaux traînés en travers de la chaussée : {objet}.',
    'Barrage de mobilier urbain en formation, secteur {lieu}. Matériaux : {objet}.',
  ]),
];
